# 自定义协议解析使用指南

## 1. 功能概览

协议解析页面已经补齐以下交互能力：

- 筛选区、规则编辑区、调试区优先使用下拉选择，减少手工输入。
- 页面内置上行、下行完整模板，支持一键填充整套配置。
- `matchRuleJson`、`frameConfigJson`、`parserConfigJson`、`releaseConfigJson` 支持预设按钮。
- 上行调试、下行编码调试支持主题、消息类型、示例载荷一键填充。
- 插件模式支持从运行时已安装插件和插件目录中直接选择 `pluginId` 和版本。

如果通过页面配置，推荐先选模板，再微调细节。
如果通过接口配置，注意 `matchRuleJson`、`frameConfigJson`、`parserConfigJson`、`visualConfigJson`、`releaseConfigJson` 需要以字符串形式提交。

## 2. 推荐配置流程

### 2.1 页面入口

- 菜单：设备中心 -> 协议解析
- 菜单：设备中心 -> 设备管理 -> 定位器

### 2.2 页面配置顺序

1. 先选择模板。
2. 再确认作用域、产品、方向、传输方式。
3. 使用 JSON 预设按钮补齐匹配、拆帧、解析和灰度配置。
4. 在脚本模式下确认 `scriptContent`，或在插件模式下直接从下拉选择插件。
5. 保存后先做在线调试，再发布和启用。

### 2.3 作用域选择建议

- `PRODUCT`
  适合单个产品的私有协议。
- `TENANT`
  适合作为租户默认协议，调试时建议显式传入 `productId`。

## 3. 完整配置示例

### 3.1 MQTT JSON 属性上报

页面模板：`MQTT JSON 属性上报`

适用场景：

- 设备通过 MQTT 上报标准 JSON
- 载荷中包含 `properties`、`deviceName`、`timestamp`

页面字段：

- 作用域：`PRODUCT`
- 产品：`1001`
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
  "messageType": "PROPERTY_REPORT"
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
  const rawBody = json.parse(ctx.payloadText || '{}');
  const body = rawBody && typeof rawBody === 'object' ? rawBody : { value: rawBody };
  const payloadField = config.payloadField || 'properties';
  const timestampField = config.timestampField || 'timestamp';
  const deviceNameField = config.deviceNameField || 'deviceName';
  const nestedPayload = body[payloadField];
  const payload =
    nestedPayload && !Array.isArray(nestedPayload) && typeof nestedPayload === 'object'
      ? nestedPayload
      : body;
  return {
    messages: [
      {
        type: config.messageType || 'PROPERTY_REPORT',
        topic: ctx.topic || config.defaultTopic || '/up/property',
        payload,
        deviceName: body[deviceNameField] || undefined,
        timestamp: body[timestampField] || Date.now(),
      },
    ],
  };
}
```

上行调试示例：

- 协议：`MQTT`
- 传输方式：`MQTT`
- 主题：`/up/property`
- 载荷编码：`JSON`

```json
{
  "deviceName": "demo-device-01",
  "timestamp": 1710000000000,
  "properties": {
    "temperature": 23.6,
    "humidity": 48
  }
}
```

### 3.2 TCP 分隔符属性上报

页面模板：`TCP 分隔符属性上报`

适用场景：

- TCP 长连接上报文本报文
- 报文按换行分帧
- 单帧内容为 `key=value,key=value`

页面字段：

- 作用域：`PRODUCT`
- 产品：`1002`
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
  "topicPrefix": "/tcp/telemetry"
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
  "defaultTopic": "/tcp/telemetry",
  "messageType": "PROPERTY_REPORT",
  "pairSeparator": ",",
  "kvSeparator": "="
}
```

`visualConfigJson`

```json
{
  "template": "JSON_PROPERTY",
  "topic": "/tcp/telemetry",
  "payloadField": "properties",
  "deviceNameField": "deviceName",
  "timestampField": "timestamp",
  "messageType": "PROPERTY_REPORT"
}
```

`scriptContent`

```javascript
function parseValue(raw) {
  const text = String(raw || '').trim();
  if (text === '') {
    return '';
  }
  const numeric = Number(text);
  return Number.isNaN(numeric) ? text : numeric;
}

function parse(ctx) {
  const config = ctx.config || {};
  const pairSeparator = config.pairSeparator || ',';
  const kvSeparator = config.kvSeparator || '=';
  const text = String(ctx.payloadText || '').trim();
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
        type: config.messageType || 'PROPERTY_REPORT',
        topic: ctx.topic || config.defaultTopic || '/tcp/telemetry',
        payload,
        timestamp: Date.now(),
      },
    ],
  };
}
```

上行调试示例：

- 协议：`TCP_UDP`
- 传输方式：`TCP`
- 主题：`/tcp/telemetry`
- 载荷编码：`TEXT`

```text
temp=23.6,humidity=48
```

如果设备实际上传十六进制，可以在页面里直接点击“填充 HEX 示例”。

### 3.3 MQTT 下行 JSON 指令

页面模板：`MQTT 下行 JSON 指令`

适用场景：

- 平台向设备下发属性设置或服务调用
- 设备订阅固定 MQTT 下行主题
- 下行内容要求为 JSON 文本

页面字段：

- 作用域：`PRODUCT`
- 产品：`1003`
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
  }
}
```

`visualConfigJson`

```json
{
  "template": "JSON_ENCODE",
  "topic": "/down/property",
  "payloadField": "payload",
  "payloadEncoding": "JSON",
  "messageType": "PROPERTY_SET"
}
```

`scriptContent`

```javascript
function encode(ctx) {
  const config = ctx.config || {};
  return {
    topic: ctx.topic || config.defaultTopic || '/down/property',
    payloadEncoding: config.payloadEncoding || 'JSON',
    payloadText: JSON.stringify(ctx.payload || {}),
    headers: config.headers || {},
  };
}
```

下行调试示例：

- 主题：`/down/property`
- 消息类型：`PROPERTY_SET`

```json
{
  "payload": {
    "power": true,
    "brightness": 80
  }
}
```

### 3.4 TCP 下行 HEX 指令

页面模板：`TCP 下行 HEX 指令`

适用场景：

- TCP 设备需要固定帧头
- 指令中包含开关位和单字节参数
- 输出要求为十六进制字符串

页面字段：

- 作用域：`PRODUCT`
- 产品：`1004`
- 协议：`TCP_UDP`
- 传输方式：`TCP`
- 方向：`DOWNLINK`
- 解析方式：`SCRIPT`
- 拆帧模式：`NONE`
- 异常策略：`ERROR`
- 超时时间：`50`
- 发布方式：`ALL`

`matchRuleJson`

```json
{
  "topicPrefix": "/downstream",
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
  "defaultTopic": "/downstream",
  "payloadEncoding": "HEX",
  "framePrefix": "AA55"
}
```

`visualConfigJson`

```json
{
  "template": "JSON_ENCODE",
  "topic": "/downstream",
  "payloadField": "payload",
  "payloadEncoding": "HEX",
  "messageType": "PROPERTY_SET"
}
```

`scriptContent`

```javascript
function toHexByte(value) {
  const normalized = Number(value || 0);
  return `00${normalized.toString(16).toUpperCase()}`.slice(-2);
}

function encode(ctx) {
  const config = ctx.config || {};
  const payload = ctx.payload || {};
  const body = payload.payload && typeof payload.payload === 'object' ? payload.payload : payload;
  const power = body.power ? '01' : '00';
  const brightness = toHexByte(body.brightness || 0);
  return {
    topic: ctx.topic || config.defaultTopic || '/downstream',
    payloadEncoding: config.payloadEncoding || 'HEX',
    payloadHex: `${config.framePrefix || 'AA55'}${power}${brightness}`,
  };
}
```

下行调试示例：

- 主题：`/downstream`
- 消息类型：`PROPERTY_SET`

```json
{
  "payload": {
    "power": true,
    "brightness": 80
  }
}
```

预期结果：

- 主题：`/downstream`
- 编码：`HEX`
- 载荷：`AA550150`

### 3.5 灰度发布配置示例

全量发布：

```json
{}
```

设备名单灰度：

```json
{
  "deviceIds": [1001, 1002],
  "deviceNames": ["demo-device-01", "demo-device-02"]
}
```

哈希百分比灰度：

```json
{
  "percent": 10
}
```

## 4. 在线调试建议

### 4.1 上行调试

- MQTT、HTTP、CoAP 优先使用 `JSON` 载荷编码。
- TCP、UDP 如果是文本协议，可直接使用 `TEXT` 示例载荷。
- TCP、UDP 如果是原始报文，可直接使用页面里的 `HEX` 示例按钮。

### 4.2 下行编码调试

- 先选 `messageType`，再点示例按钮填充 `payloadText`。
- 如果编码结果不符合预期，优先检查 `parserConfigJson` 和 `scriptContent`。
- 如果规则是租户默认级，调试时务必补 `productId`。

## 5. 设备定位器使用方式

当上行报文里没有直接携带 `productKey + deviceName` 时，可以通过定位器识别设备。

操作步骤：

1. 进入设备管理。
2. 找到目标设备。
3. 点击“定位器”。
4. 新增 `locatorType + locatorValue`。

常见定位器类型：

- `IMEI`
- `ICCID`
- `MAC`
- `SERIAL`
- `CLIENT_ID`

## 6. 推荐实践

- 新协议优先从 `SCRIPT + UPLINK` 起步，先把链路和调试跑通。
- 下行编码独立建 `DOWNLINK` 规则，不要和上行规则混用。
- 页面里能用模板和下拉的地方不要手工输入，避免协议名、插件 ID、消息类型拼写错误。
- 灰度发布先用设备名单，再扩大到哈希百分比。
- 插件模式优先用于强性能、强依赖 SDK 或复杂状态机场景。
