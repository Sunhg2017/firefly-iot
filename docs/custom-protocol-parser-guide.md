# 自定义协议解析使用与运维指南

## 1. 适用对象

本文档面向以下角色:

- 产品实施
- 平台运维
- 物联网接入开发
- 联调测试人员

## 2. 功能入口

### Web 入口

- 菜单: 设备中心 -> 协议解析
- 菜单: 设备中心 -> 设备管理 -> 定位器

### 后端入口

- 规则管理: `/api/v1/protocol-parsers/*`
- 运行时面板: `/api/v1/protocol-parsers/runtime/*`
- 设备定位器: `/api/v1/devices/{deviceId}/locators`

## 3. 规则配置流程

### 3.1 选择作用域

- `PRODUCT`
  - 规则仅对指定产品生效。
- `TENANT`
  - 作为租户默认规则。
  - 调试和运行时需要结合产品上下文命中。

### 3.2 选择方向

- `UPLINK`
  - 设备上行解析。
- `DOWNLINK`
  - 云端下行编码。

### 3.3 选择执行模式

- `SCRIPT`
  - 适合大多数私有 JSON/文本/简单二进制报文。
- `PLUGIN`
  - 适合依赖厂商 SDK、复杂状态机、复杂二进制协议。

### 3.4 填写关键配置

- `matchRuleJson`
  - 决定规则是否命中。
- `frameConfigJson`
  - 决定 TCP/UDP 如何分帧。
- `parserConfigJson`
  - 业务配置，注入 `ctx.config`。
- `visualConfigJson`
  - 最小可视化配置，用于快速生成脚本。
- `releaseMode`
  - 决定灰度策略。

## 4. 常见配置示例

### 4.1 上行 JSON 属性上报

适合:

- MQTT
- HTTP
- CoAP

推荐配置:

```json
{
  "topicPrefix": "/up/property"
}
```

```json
{
  "payloadField": "properties",
  "deviceNameField": "deviceName",
  "timestampField": "timestamp",
  "messageType": "PROPERTY_REPORT"
}
```

### 4.2 TCP 定长报文

推荐配置:

```json
{
  "fixedLength": 32
}
```

`frameMode` 选择 `FIXED_LENGTH`。

### 4.3 灰度发布 10%

```json
{
  "percent": 10
}
```

`releaseMode` 选择 `HASH_PERCENT`。

### 4.4 指定设备灰度

```json
{
  "deviceIds": [1001, 1002],
  "deviceNames": ["demo-device-01", "demo-device-02"]
}
```

`releaseMode` 选择 `DEVICE_LIST`。

## 5. 在线调试

### 5.1 上行调试

适用于验证:

- 命中规则是否正确
- 设备定位是否正确
- 报文是否被解析成标准 `DeviceMessage`

输入重点:

- `productId`
  - 当调试 `TENANT` scope 规则时建议显式传入。
- `payloadEncoding`
  - `HEX` 常用于 TCP/UDP。
  - `JSON` 常用于 MQTT/HTTP/CoAP。

### 5.2 下行编码调试

适用于验证:

- 下行主题是否正确
- 编码结果是否为设备要求的文本/十六进制/JSON
- 插件或脚本的 `encode(ctx)` 是否符合预期

## 6. 设备定位器使用方法

当设备上行报文里不直接携带 `productKey + deviceName` 时，可以通过定位器识别设备。

操作步骤:

1. 进入设备管理。
2. 找到目标设备。
3. 点击“定位器”。
4. 新增 `locatorType + locatorValue`。

常见定位器类型:

- `IMEI`
- `ICCID`
- `MAC`
- `SERIAL`
- `CLIENT_ID`

建议:

- 同一类标识只保留一个主定位器。
- 规则里优先输出稳定且唯一的外部标识。

## 7. 插件部署指南

### 7.1 部署方式

插件支持两种来源:

- Connector classpath
- `plugins/protocol-parsers/*.jar`

### 7.2 重载方式

部署后执行:

- 前端协议解析页点击 `Reload Plugins`
- 或调用 `POST /api/v1/protocol-parsers/runtime/plugins/reload`

### 7.3 验证方式

检查:

- `GET /api/v1/protocol-parsers/runtime/plugins`
- `GET /api/v1/protocol-parsers/runtime/plugins/catalog`

确认插件已安装、版本正确、支持的能力正确。

## 8. 运行时观测

前端运行时面板可查看:

- 解析次数
- 编码次数
- 调试成功次数
- 平均耗时
- 已安装插件
- 插件目录
- transport 维度计数器

适合日常巡检与联调复盘。

## 9. 常见排障

### 9.1 规则未命中

优先检查:

- `productId` 是否正确
- `scopeType` 是否符合预期
- `direction` 是否正确
- `matchRuleJson` 是否与实际 topic/header/messageType 一致

### 9.2 调试成功但正式链路无数据

优先检查:

- 是否已发布
- 规则是否为 `ENABLED`
- 灰度配置是否把当前设备排除
- Connector 是否已收到缓存失效事件

### 9.3 TCP/UDP 解析异常

优先检查:

- `frameMode`
- `frameConfigJson`
- 实际上报编码是否与 `payloadEncoding` 一致
- 是否需要多包拼接

### 9.4 插件已部署但页面看不到

优先检查:

- JAR 是否放在 `plugins/protocol-parsers` 目录
- 是否包含正确的 `META-INF/services`
- 是否执行过 reload
- 插件依赖是否只依赖 `firefly-plugin-api`

## 10. 验证命令

### 前端

```bash
cd firefly-web
npm run build
```

### 后端

```bash
mvn -pl firefly-device,firefly-connector -am test
mvn -pl firefly-system -am -DskipTests compile
```

## 11. 推荐实践

- 新协议先从 `SCRIPT + UPLINK` 起步，先打通链路。
- 下行编码独立建 `DOWNLINK` 规则，不和上行混用。
- 租户级公共协议用 `TENANT` scope，产品个性逻辑再用 `PRODUCT` scope 覆盖。
- 灰度发布先小范围设备名单，再扩大到哈希比例。
- 插件只留给高复杂度或强性能场景。
