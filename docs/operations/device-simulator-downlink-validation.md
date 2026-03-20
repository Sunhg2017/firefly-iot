# 设备模拟器统一下行验证运维说明

> 版本: v1.0.0
> 日期: 2026-03-21
> 状态: Done

## 1. 适用范围

本文档用于设备消息工作台统一下行验证能力的部署后检查、联调排障和回滚，覆盖 MQTT、WebSocket、TCP、UDP、LoRaWAN 五类协议。

## 2. 发布内容

本次涉及两个模块：

- `firefly-connector`
  - 统一 Kafka 下行消费
  - 非 MQTT 下行分发
  - WebSocket/TCP/UDP 身份绑定
  - LoRaWAN 下行查询接口
- `firefly-simulator`
  - UDP 持久连接
  - WebSocket/TCP/UDP 绑定报文发送
  - LoRaWAN 下行轮询
  - 长 payload 完整展示

## 3. 发布前检查

### 3.1 Connector

- Kafka 主题 `device.message.down` 正常可用。
- `firefly-connector` 能访问设备基础信息、产品基础信息、设备定位解析接口。
- WebSocket/TCP/UDP/LoRaWAN 对应协议开关与端口配置正确。

### 3.2 Simulator

- 安装包或工作目录来自本次最新构建。
- Electron 主进程与 preload 已同步更新，不能只替换前端静态资源。

## 4. 构建与验证

执行：

```bash
mvn -pl firefly-connector -am -DskipTests compile
cd firefly-simulator
npm run build:vite
```

通过标准：

- Maven 编译成功。
- 模拟器 renderer、electron main、preload 构建全部成功。

## 5. 联调检查

### 5.1 WebSocket

1. 模拟器连接 WebSocket 设备。
2. 确认连接 URL 自动带出 `productKey/deviceName/locators`。
3. 从工作台发送下行，确认模拟器消息面板收到完整文本。

### 5.2 TCP / UDP

1. 模拟器连接成功后，确认连接器日志中出现 bootstrap binding 建立日志。
2. 从工作台发送下行，确认能路由到当前会话。
3. 断开重连后再次发送，确认绑定会自动重新建立。

### 5.3 LoRaWAN

1. 模拟器保持在线。
2. 从工作台发送下行。
3. 访问：

```text
GET /api/v1/lorawan/devices/{devEui}/downlinks?sinceTs=...
```

4. 确认接口返回新记录，模拟器面板也同步展示。

## 6. 常见排障

### 6.1 工作台已发送，但 WebSocket/TCP/UDP 看不到下行

- 检查平台设备是否能通过 `productKey + deviceName/locators` 解析到真实设备。
- 检查模拟器是否已发送 `_fireflyBinding` 保留报文。
- 检查连接器是否存在旧的失效 MQTT 路由；本次实现会自动清理，但仍建议确认连接器日志。

### 6.2 UDP 可以上行，不能下行

- 确认模拟器已使用新的 `udp:connect` 持久连接，而不是旧的一次性发送逻辑。
- 确认防火墙未拦截本机 UDP 回包。
- 检查连接器是否已记录到该 peer，并完成绑定。

### 6.3 LoRaWAN 看不到下行

- 确认平台设备与 `devEui` 的定位器映射已配置。
- 确认 `GET /api/v1/lorawan/devices/{devEui}/downlinks` 能返回记录。
- 若平台已有旧缓存或错误定位器数据，优先清理旧数据后再验证，不在代码中做兼容分支。

## 7. 日志定位

- Connector
  - `MqttDownstreamConsumer`
  - `NonMqttDownstreamDispatcher`
  - `DeviceWebSocketHandler`
  - `TcpUdpProtocolAdapter`
  - `LoRaWanServer`
- Simulator
  - Electron `main.ts`
  - 渲染层设备协议面板

重点关注关键字：

- `bootstrap binding established`
- `Delivered downstream message through non-MQTT transport`
- `LoRaWAN downlink queued`

## 8. 回滚说明

如需回滚，只需回退本次 connector 与 simulator 相关代码，并重新执行：

```bash
mvn -pl firefly-connector -am -DskipTests compile
cd firefly-simulator
npm run build:vite
```

若问题源于历史定位器或旧设备映射数据，应先清理旧数据后再决定是否回滚。
