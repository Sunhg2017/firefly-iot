# 设备模拟器统一下行验证设计

> 版本: v1.0.0
> 日期: 2026-03-21
> 状态: Done

## 1. 背景

设备消息工作台已经支持通过统一下行入口向平台设备发送属性设置、服务调用和通用下行消息，但此前真正能在模拟器里闭环验证的只有 MQTT。

其余协议存在以下问题：

- WebSocket、TCP、UDP 没有接入统一下行分发，工作台下发后模拟器侧看不到结果。
- TCP/UDP 缺少稳定的“平台设备身份 -> 连接会话”绑定手段，连接建立后无法把下行消息准确路由回当前模拟设备。
- LoRaWAN 只有上行 webhook 模拟，没有可轮询的下行验证面。
- WebSocket/TCP/LoRaWAN 消息面板使用省略展示，长 payload 无法完整核对。
- UDP 模拟器原先是一次性发送，没有持续连接和接收通道，无法验证下行。

## 2. 目标

- 让设备消息工作台统一下发能力覆盖 MQTT、WebSocket、TCP、UDP、LoRaWAN。
- 让模拟器能够在不暴露数据库主键、不依赖人工补绑会话的前提下完成下行验证。
- 保持现有协议解析器和自定义下行编码能力可复用，不为单个协议再复制一套下发逻辑。
- 让长消息在模拟器中完整可见，便于联调和留证。

## 3. 范围

本次变更覆盖：

- `firefly-connector`
  - 统一 Kafka 下行消费入口
  - WebSocket/TCP/UDP/LoRaWAN 下行分发
  - TCP/UDP 会话绑定
  - LoRaWAN 下行暂存与查询接口
- `firefly-simulator`
  - WebSocket/TCP/UDP/LoRaWAN 连接与验证能力
  - 下行消息展示与轮询
  - 长 payload 展示
  - 自定义协议验证面板与运行态业务身份复用
  - 本地 `CUSTOM` 联调样本初始化脚本

本次不覆盖：

- 新增数据库表结构
- 新增菜单、权限点或 Flyway 台账
- 设备自动回复 `property/set/reply` 或 `service/reply`

## 4. 总体方案

### 4.1 统一下行消费入口

- 保留 `device.message.down` 作为唯一 Kafka 下行主题。
- `MqttDownstreamConsumer` 不再仅在 MQTT 开启时才存在，而是始终消费该主题。
- 消费顺序改为：
  1. 先尝试 MQTT 路由。
  2. 若 MQTT 路由不存在、已失效或恢复失败，则转入非 MQTT 分发器。
  3. 非 MQTT 分发器按 WebSocket -> TCP -> UDP -> LoRaWAN 顺序尝试投递。

这样可以保证统一工作台无需区分协议类型，仍然只发一次下行命令。

### 4.2 非 MQTT 分发器

新增 `NonMqttDownstreamDispatcher`，职责如下：

- 复用 `ProtocolDownlinkEncodeService` 进行自定义下行编码。
- 编码器未处理时，回退到 `MessageCodec.encodeJson(message)`。
- WebSocket 只发送文本负载。
- TCP 发送原始字节；若内容可判定为文本，则自动补换行，兼容现有模拟器阅读习惯。
- UDP 发送原始字节到已绑定 peer。
- LoRaWAN 将下行记录暂存到连接器内存，并提供查询接口给模拟器轮询。

### 4.3 连接与设备身份绑定

#### WebSocket

- 模拟器连接 WebSocket 时附带：
  - `productKey`
  - `deviceName`
  - `locators` JSON
  - 已有的 `deviceId/productId/tenantId`
- 连接器优先按 `deviceId` 补齐平台设备元数据。
- 若没有 `deviceId`，则按 `productKey + deviceName/locators` 解析平台设备。
- 同一套 `productKey + deviceName/locators` 也会被模拟器右侧“自定义协议验证”卡片复用，用来加载匹配当前设备的解析规则。

#### TCP / UDP

- 模拟器在 TCP/UDP 建连成功后立即发送保留报文：

```json
{
  "_fireflyBinding": {
    "productKey": "demo_product",
    "deviceName": "demo_device",
    "locators": [
      {
        "locatorType": "IMEI",
        "locatorValue": "123456789012345",
        "primaryLocator": true
      }
    ]
  }
}
```

- 连接器在 `TcpUdpProtocolAdapter` 中识别该保留报文。
- 该报文只用于建立 `TcpUdpBindingContext`，不会继续作为上行消息发布。
- 建立绑定后，统一下行分发器即可根据平台 `deviceId` 找到当前 TCP/UDP 会话。
- 由于绑定报文与自定义协议验证共用同一套业务身份，WebSocket/TCP/UDP 现在既能验证工作台下行，也能直接验证协议解析规则。

### 4.4 LoRaWAN 下行验证

- 连接器新增 LoRaWAN 下行暂存队列，每个 `devEui` 保留最近 200 条。
- 工作台或统一下行分发器写入 LoRaWAN 下行时，会记录：
  - `messageId`
  - `deviceId / deviceName`
  - `messageType`
  - `devEui`
  - `fPort`
  - `confirmed`
  - `data`
  - `displayPayload`
  - `queuedAt`
- 新增查询接口：
  - `GET /api/v1/lorawan/devices/{devEui}/downlinks?sinceTs=...`
- 模拟器在线时轮询该接口并展示下行结果。

## 5. 关键设计取舍

- 没有为 WebSocket/TCP/UDP 单独再造一套下行编码接口，而是统一复用协议解析器里的下行编码能力，减少多套实现漂移。
- TCP/UDP 不要求用户在 UI 中手工绑定平台设备主键，而是直接复用产品唯一键、设备名和定位器，符合“尽量减少用户手工输入”的仓库规则。
- LoRaWAN 采用“连接器内存暂存 + 模拟器轮询”而不是强推送，是因为当前模拟器验证目标是联调确认，不需要引入额外消息通道和外部依赖。
- 自定义协议验证继续复用现有 `/api/v1/protocol-parsers/{id}/test` 与 `/encode-test` 接口，不额外新增模拟器专用调试后端。

## 6. 风险与边界

- LoRaWAN 当前是“可验证平台是否发起下行”，不是完整网络服务器下发闭环，不模拟真实网关确认。
- WebSocket 目前只支持文本下行展示；若编码器产出纯二进制，连接器会跳过 WebSocket 投递。
- TCP/UDP 依赖模拟器先发送 `_fireflyBinding` 保留报文；若业务设备未发送该报文，统一下行仍无法反向路由到该会话。
- 下行验证解决的是“看得到平台下发”，不包含自动回复链路。

## 7. 验证

执行：

```bash
mvn -pl firefly-connector -am -DskipTests compile
cd firefly-simulator
npm run build:vite
```

手工回归：

1. 用 WebSocket/TCP/UDP/LoRaWAN 模拟器分别建立在线连接。
2. 在设备消息工作台发送属性设置、服务调用或通用下行。
3. 确认对应协议面板能看到完整 payload。
4. TCP/UDP 重新连接后再次验证，确认 `_fireflyBinding` 自动生效。
5. LoRaWAN 发送后确认模拟器轮询列表出现新下行记录。
6. 在支持自定义协议的模拟设备上打开“自定义协议验证”卡片，确认能加载当前协议规则并执行直接调试。
