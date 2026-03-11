# 自定义协议解析使用指南

## 1. 功能概览

自定义协议解析页面已经具备完整可用能力：

- 产品级规则与租户默认级规则配置
- 上行解析与下行编码双向支持
- Script 与 Plugin 两种模式
- 规则发布、回滚、启停、版本历史
- 运行时指标、插件目录、插件重载
- 轻量可视化编排与一键生成脚本
- 上行调试与下行编码测试

本轮页面优化的重点是：

- 尽量减少用户手工输入
- 尽量不直接暴露数据库主键
- 优先展示业务唯一键 `tenantCode`、`productKey`

## 2. 页面使用原则

### 2.1 先模板后微调

推荐操作顺序：

1. 先选择模板。
2. 再选择作用域、产品、方向、协议与传输方式。
3. 使用 JSON 预设按钮补齐匹配规则、拆帧配置、解析配置、灰度配置。
4. 最后根据设备协议微调脚本或插件配置。

### 2.2 作用域选择

- `产品级`
  - 适用于单个产品的私有协议
  - 页面会要求选择产品
  - 配置会自动补齐 `tenantCode + productKey`
- `租户默认级`
  - 适用于租户范围的默认协议
  - 页面无需选择产品
  - 配置会自动补齐 `tenantCode`

### 2.3 主键使用口径

当前页面不再要求用户理解或输入以下内部主键：

- `scopeId`
- 规则内部 ID
- 产品内部主键

页面统一改为：

- 产品下拉显示 `产品名称 (productKey)`
- 规则作用域显示 `tenantCode` 或 `productKey`
- 弹窗标题使用业务可识别名称

## 3. 关键字段说明

### 3.1 作用域 ID

- 含义：后端内部归属字段。
- 当前页面：隐藏，不需要人工填写。
- 你只需要关注：
  - 是“产品级”还是“租户默认级”
  - 选了哪个产品

### 3.2 协议

- 用于匹配协议族或适配器类别。
- 常见值：
  - `TCP_UDP`
  - `MQTT`
  - `HTTP`
  - `COAP`
  - `WEBSOCKET`

### 3.3 传输方式

- 用于匹配运行时实际通道。
- 常见值：
  - `TCP`
  - `UDP`
  - `MQTT`
  - `HTTP`
  - `COAP`
  - `WEBSOCKET`

关键理解：

- MQTT、HTTP 这类场景下，协议和传输方式可能相同。
- TCP/UDP 场景下不相同：
  - 协议使用 `TCP_UDP`
  - 传输方式明确选 `TCP` 或 `UDP`

### 3.4 解析配置 JSON

`parserConfigJson` 会注入运行时 `ctx.config`，供脚本或插件读取。

当前页面会自动补齐：

- `tenantCode`
- `productKey`

因此建议你在脚本里优先使用这些业务标识，而不是依赖内部主键。

## 4. 推荐配置流程

1. 进入“设备中心 -> 自定义协议解析”。
2. 点击“新建规则”。
3. 选择模板。
4. 选择作用域。
5. 如果是产品级，选择产品。
6. 选择协议、传输方式、方向。
7. 检查预填的 `matchRuleJson`、`frameConfigJson`、`parserConfigJson`。
8. 编辑脚本或选择插件。
9. 保存草稿。
10. 先调试，再发布，再启用。

## 5. 完整配置示例

以下示例使用统一的业务标识：

- `tenantCode = demo-tenant`
- 产品 A：`智慧照明网关 (light-gateway)`
- 产品 B：`工业采集器 (collector-pro)`

### 5.1 示例一：产品级 MQTT JSON 属性上报

适用场景：

- 设备通过 MQTT 上报标准 JSON
- 载荷中包含 `deviceName`、`timestamp`、`properties`

页面字段：

- 作用域：`产品级`
- 产品：`智慧照明网关 (light-gateway)`
- 协议：`MQTT`
- 传输方式：`MQTT`
- 方向：`UPLINK`
- 解析方式：`SCRIPT`
- 拆帧模式：`NONE`
- 异常策略：`ERROR`
- 超时时间：`50`
- 发布方式：`ALL`

`matchRuleJson`

```json
{
  "topicPrefix": "/up/property"
}
```

`frameConfigJson`

```json
{}
```

`parserConfigJson`

```json
{
  "defaultTopic": "/up/property",
  "payloadField": "properties",
  "deviceNameField": "deviceName",
  "timestampField": "timestamp",
  "messageType": "PROPERTY_REPORT",
  "tenantCode": "demo-tenant",
  "productKey": "light-gateway"
}
```

`visualConfigJson`

```json
{
  "template": "JSON_PROPERTY",
  "topic": "/up/property",
  "payloadField": "properties",
  "deviceNameField": "deviceName",
  "timestampField": "timestamp",
  "messageType": "PROPERTY_REPORT"
}
```

`scriptContent`

```javascript
function parse(ctx) {
  const config = ctx.config || {};
  const body = JSON.parse(ctx.payloadText || "{}");
  const payloadField = config.payloadField || "properties";
  const deviceNameField = config.deviceNameField || "deviceName";
  const timestampField = config.timestampField || "timestamp";
  const payload =
    body && typeof body === "object" && body[payloadField] && typeof body[payloadField] === "object"
      ? body[payloadField]
      : body;

  return {
    messages: [
      {
        type: config.messageType || "PROPERTY_REPORT",
        topic: ctx.topic || config.defaultTopic || "/up/property",
        payload,
        deviceName: body[deviceNameField] || undefined,
        timestamp: body[timestampField] || Date.now()
      }
    ]
  };
}
```

上行调试示例：

- 调试产品：`智慧照明网关 (light-gateway)`
- 协议：`MQTT`
- 传输方式：`MQTT`
- 主题：`/up/property`
- 载荷编码：`JSON`

```json
{
  "deviceName": "light-01",
  "timestamp": 1710000000000,
  "properties": {
    "power": true,
    "brightness": 80
  }
}
```

### 5.2 示例二：租户默认级 TCP 文本键值对上报

适用场景：

- 多个产品共用一套租户级默认 TCP 文本协议
- 报文按换行拆帧
- 单帧内容是 `key=value,key=value`

页面字段：

- 作用域：`租户默认级`
- 产品：无需选择
- 协议：`TCP_UDP`
- 传输方式：`TCP`
- 方向：`UPLINK`
- 解析方式：`SCRIPT`
- 拆帧模式：`DELIMITER`
- 异常策略：`ERROR`
- 超时时间：`50`
- 发布方式：`ALL`

`matchRuleJson`

```json
{
  "topicPrefix": "/tcp/data"
}
```

`frameConfigJson`

```json
{
  "delimiterHex": "0A",
  "stripDelimiter": true
}
```

`parserConfigJson`

```json
{
  "defaultTopic": "/tcp/data",
  "messageType": "PROPERTY_REPORT",
  "pairSeparator": ",",
  "kvSeparator": "=",
  "tenantCode": "demo-tenant"
}
```

`visualConfigJson`

```json
{
  "template": "TEXT_KV",
  "topic": "/tcp/data",
  "pairSeparator": ",",
  "kvSeparator": "=",
  "messageType": "PROPERTY_REPORT"
}
```

`scriptContent`

```javascript
function parseValue(raw) {
  const text = String(raw || "").trim();
  if (text === "") {
    return "";
  }
  const numeric = Number(text);
  return Number.isNaN(numeric) ? text : numeric;
}

function parse(ctx) {
  const config = ctx.config || {};
  const pairSeparator = config.pairSeparator || ",";
  const kvSeparator = config.kvSeparator || "=";
  const text = String(ctx.payloadText || "").trim();
  if (!text) {
    return { drop: true };
  }

  const payload = {};
  for (const segment of text.split(pairSeparator)) {
    const index = segment.indexOf(kvSeparator);
    if (index < 0) {
      continue;
    }
    const key = segment.slice(0, index).trim();
    const value = segment.slice(index + kvSeparator.length).trim();
    if (!key) {
      continue;
    }
    payload[key] = parseValue(value);
  }

  return {
    messages: [
      {
        type: config.messageType || "PROPERTY_REPORT",
        topic: ctx.topic || config.defaultTopic || "/tcp/data",
        payload,
        timestamp: Date.now()
      }
    ]
  };
}
```

上行调试示例：

- 调试产品：`工业采集器 (collector-pro)`
- 协议：`TCP_UDP`
- 传输方式：`TCP`
- 主题：`/tcp/data`
- 载荷编码：`TEXT`

```text
temperature=23.6,humidity=48
```

说明：

- 虽然规则是“租户默认级”，调试时仍建议选择“调试产品”补齐运行时上下文。
- 该示例中不会写入 `productKey`，因为规则本身是租户默认规则。

### 5.3 示例三：产品级 MQTT 下行 JSON 指令

适用场景：

- 平台向设备下发属性设置或服务调用
- 设备订阅固定 MQTT 下行主题
- 下行载荷要求是 JSON 文本

页面字段：

- 作用域：`产品级`
- 产品：`智慧照明网关 (light-gateway)`
- 协议：`MQTT`
- 传输方式：`MQTT`
- 方向：`DOWNLINK`
- 解析方式：`SCRIPT`
- 拆帧模式：`NONE`
- 异常策略：`ERROR`
- 超时时间：`50`
- 发布方式：`ALL`

`matchRuleJson`

```json
{
  "topicPrefix": "/down/property",
  "messageTypeEquals": "PROPERTY_SET"
}
```

`frameConfigJson`

```json
{}
```

`parserConfigJson`

```json
{
  "defaultTopic": "/down/property",
  "payloadEncoding": "JSON",
  "headers": {
    "qos": "1"
  },
  "tenantCode": "demo-tenant",
  "productKey": "light-gateway"
}
```

`visualConfigJson`

```json
{
  "template": "DOWNLINK_JSON",
  "topic": "/down/property",
  "payloadEncoding": "JSON"
}
```

`scriptContent`

```javascript
function encode(ctx) {
  const config = ctx.config || {};
  return {
    topic: ctx.topic || config.defaultTopic || "/down/property",
    payloadText: JSON.stringify(ctx.payload || {}),
    payloadEncoding: config.payloadEncoding || "JSON",
    headers: config.headers || {}
  };
}
```

下行编码测试示例：

- 调试产品：`智慧照明网关 (light-gateway)`
- 主题：`/down/property`
- 消息类型：`PROPERTY_SET`

```json
{
  "payload": {
    "power": true,
    "brightness": 60
  }
}
```

## 6. 调试建议

### 6.1 上行调试

优先补齐以下字段：

- 调试产品
- 传输方式
- 主题
- 载荷编码
- 设备名称

一般情况下，先选择传输方式，再点击“填充示例载荷”即可快速开始。

### 6.2 下行编码测试

优先补齐以下字段：

- 调试产品
- 主题
- 消息类型
- 设备名称
- 载荷 JSON

如果不确定载荷结构，可先点击：

- 属性设置示例
- 服务调用示例

## 7. 常见问题

### 7.1 为什么页面里没有“作用域 ID”了

因为 `scopeId` 是后端内部字段，当前页面已经隐藏，用户只需要关注业务范围和产品选择。

### 7.2 为什么协议和传输方式要分开

因为运行时匹配和分帧都需要这两个维度，尤其是 TCP/UDP 共用一个协议族，但要靠传输方式区分具体通道。

### 7.3 为什么调试时还要选产品

租户默认规则虽然不绑定单一产品，但调试和运行时通常仍然需要明确产品上下文，才能补齐正确的业务键和设备模型信息。

## 8. 使用建议

- 优先通过页面模板和预设按钮配置，不要从零手写整段 JSON。
- 优先记住 `tenantCode`、`productKey`、`deviceName`，不要依赖数据库主键。
- 规则保存后先调试、再发布、再启用。
- 复杂协议脚本请保留必要注释，便于后续接手维护。

## 2026-03-12 Usage Update

### Important Behavior Adjustments

- Available parser modes are now:
  - `SCRIPT`
  - `PLUGIN`
- `BUILTIN` is not supported and cannot be saved/published.

### Error Policy Behavior

- `ERROR`: parser error is treated as failure; system may try other matching rules. If no rule succeeds, message is handled-empty.
- `DROP`: message is dropped immediately (handled-empty).
- `RAW_DATA`: parser failure allows fallback to raw pipeline (`notHandled`).

### TCP/UDP Frame Buffer Protection

- You can configure `frameConfig.maxBufferedBytes` to cap half-packet accumulation.
- If a session remainder exceeds the cap, runtime clears remainder and drops the oversized partial packet.

### Release Scope Matching

- Release strategy (`ALL` / `DEVICE_LIST` / `HASH_PERCENT`) is now applied consistently during frame decode and parse matching when device context is known.

### Debug Impact

- Debug frame splitting no longer writes into production TCP/UDP session buffers.
- Running debug half-packet cases will not affect online device sessions.
