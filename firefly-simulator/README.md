# Firefly IoT 设备模拟器

基于 Electron + React + Ant Design 的桌面端设备模拟工具，用于模拟设备接入和数据上报。

## 功能

- **HTTP 协议模拟** — 设备认证（productKey/deviceName/deviceSecret）→ `online`/`heartbeat`/`offline` 生命周期事件 + 属性/事件上报
- **MQTT 协议模拟** — 直连 `firefly-connector` 内置 MQTT (`mqtt://host:1883`) → Topic 发布/订阅 → 属性/事件上报
- **CoAP 协议模拟** — CoAP Bridge 认证 (TTL 7d) → 属性/事件/OTA进度上报 + 设备影子拉取
- **视频设备模拟** — GB28181/RTSP 接入 → 推流/停流、PTZ 云台控制、截图、录制、目录/通道查询
- **SNMP 协议模拟** — SNMP v1/v2c/v3 设备连接测试、OID 读写
- **Modbus 协议模拟** — Modbus TCP/RTU 设备连接测试、寄存器读写
- **WebSocket 协议模拟** — WebSocket 连接 → 实时双向消息收发
- **TCP 协议模拟** — TCP Socket 连接 → 行分隔消息收发
- **UDP 协议模拟** — UDP 无连接报文发送
- **LoRaWAN 协议模拟** — 模拟 LoRaWAN 网络服务器 Webhook 上行数据推送
- **数据模板** — 内置 13 种传感器模板，支持自定义模板创建/编辑/删除
- **自定义 JSON** — 支持手动编写任意 JSON 作为上报数据
- **自动上报** — 可配置定时间隔自动发送数据（1s ~ 3600s）
- **多设备管理** — 同时模拟多个设备并发接入
- **批量导入/导出** — JSON/CSV 文件批量导入设备，一键导出当前设备配置
- **压力测试** — 并发 N 台设备×M 轮发送，实时统计 TPS/成功率/耗时
- **配置持久化** — 设备配置和自定义模板自动保存到 localStorage，刷新后恢复
- **实时日志** — 查看所有设备的连接、发送、错误日志，完整保留 MQTT 下行 payload
- **分步创建设备** — 新建模拟设备采用抽屉式分步配置，先选协议，再填写最小必填项和高级参数
- **设备管理器重构** — 左侧设备区采用总览卡片 + 搜索筛选 + 设备卡片目录，右侧补充更清晰的空态和状态摘要
- **暗色主题** — 现代化深色 UI

## 快速开始

```bash
cd firefly-simulator

# 安装依赖
npm install

# 开发模式（Vite + Electron 热重载）
npm run electron:dev

# 构建可执行文件
npm run electron:build
```

启动说明：

- `npm run electron:dev` 与 `npm run electron:build` 会先执行 `npm run ensure:electron`
- 如果本地 `node_modules/electron` 缺少实际 Electron 二进制，脚本会先自动补装，再继续启动
- 若补装失败，优先检查网络是否可访问 Electron 下载源，然后在 `firefly-simulator` 目录重新执行 `npm install` 或 `npm run ensure:electron`

## 对接说明

### HTTP 模式

模拟器通过 `firefly-connector` 的 HTTP 接入接口通信：

| 步骤 | API | 说明 |
|------|-----|------|
| 1. 认证 | `POST /api/v1/protocol/http/auth` | 获取设备 Token |
| 2. 上线 | `POST /api/v1/protocol/http/online` | Header: `X-Device-Token`，同时触发生命周期上线和内置 `online` 事件 |
| 3. 属性上报 | `POST /api/v1/protocol/http/property/post` | Header: `X-Device-Token` |
| 4. 普通事件上报 | `POST /api/v1/protocol/http/event/post` | Header: `X-Device-Token`，不用于 `online/offline/heartbeat` |
| 5. 心跳 | `POST /api/v1/protocol/http/heartbeat` | Header: `X-Device-Token`，同时触发生命周期保活和内置 `heartbeat` 事件 |
| 6. 离线 | `POST /api/v1/protocol/http/offline` | Header: `X-Device-Token`，同时触发生命周期离线和内置 `offline` 事件 |

补充说明：

- 模拟器连接前会先校验 `httpBaseUrl`、`productKey`、`deviceName`、`deviceSecret`，缺项时不会继续向服务端发起空认证请求。
- HTTP 认证请求会同时携带 JSON Body 和同名 Query 参数，方便 connector 在不同取参口径下都能兼容。
- 连接成功后，认证请求也会进入 HTTP 请求历史，便于排查“服务端未拿到认证参数”这类问题。
- 如果 HTTP 设备选择“一型一密”，模拟器会先调用 `POST /api/v1/protocol/device/register` 动态注册，拿到 `deviceSecret` 后再调用 `/api/v1/protocol/http/auth`。
- 模拟器连接后会自动调用 `/online`，断开时自动调用 `/offline`，定时心跳会调用 `/heartbeat`。
- `online`、`offline`、`heartbeat` 仍然是物模型事件；模拟器默认走专用生命周期端点，服务端也兼容通过普通 `/event/post` 上报这三个事件。

### MQTT 模式

模拟器直连 `firefly-connector` 暴露的 MQTT 端口（默认 `mqtt://localhost:1883`），通过标准 MQTT 协议通信：

| 步骤 | 说明 |
|------|------|
| 1. 连接 | clientId/username/password 认证 |
| 2. 发布 | Topic: `/sys/{productKey}/{deviceName}/thing/property/post` |
| 3. 订阅 | Topics: `/sys/{productKey}/{deviceName}/thing/property/set`、`/sys/{productKey}/{deviceName}/thing/service/+`、`/sys/{productKey}/{deviceName}/thing/downstream` |

提示：
- 一机一密产品可直接使用 `deviceName + deviceSecret` 建立连接。
- 一型一密产品需先调用 `POST /api/v1/protocol/device/register` 完成动态注册，再使用返回的 `deviceSecret` 连接 MQTT。

### CoAP 模式

模拟器通过 `firefly-connector` 的 CoAP Bridge 接口通信（HTTP ↔ CoAP 桥接）：

| 步骤 | API | 说明 |
|------|-----|------|
| 1. 认证 | `POST /api/v1/protocol/coap/auth` | 三元组认证，Token 有效期 7 天 |
| 2. 属性上报 | `POST /api/v1/protocol/coap/property?token=xxx` | byte[] payload |
| 3. 事件上报 | `POST /api/v1/protocol/coap/event?token=xxx` | byte[] payload |
| 4. OTA 进度 | `POST /api/v1/protocol/coap/ota/progress?token=xxx` | 固件升级进度 |
| 5. 拉取影子 | `GET /api/v1/protocol/coap/shadow?token=xxx` | 低功耗设备拉取 desired 属性 |

### Video 模式

模拟器通过 `firefly-media` REST API 管理视频设备，支持 GB28181 和 RTSP 代理两种接入方式：

- GB28181 模式会自动使用 `国标设备 ID` 作为本地 `DeviceName`
- RTSP 代理模式会自动使用“模拟设备名称”作为本地 `DeviceName`
- Video 设备现在也支持先绑定平台产品，再按 `ProductKey` 同步当前产品物模型

| 功能 | API | 说明 |
|------|-----|------|
| 1. 注册设备 | `POST /api/v1/video/devices` | 创建视频设备（GB28181 或 RTSP_PROXY） |
| 2. 开始推流 | `POST /api/v1/video/devices/{id}/start` | 请求 ZLMediaKit 拉流 |
| 3. 停止推流 | `POST /api/v1/video/devices/{id}/stop` | 关闭流会话 |
| 4. PTZ 控制 | `POST /api/v1/video/devices/{id}/ptz` | 云台方向/变焦控制 |
| 5. 截图 | `POST /api/v1/video/devices/{id}/snapshot` | 拍照截图 |
| 6. 开始录制 | `POST /api/v1/video/devices/{id}/record/start` | 录制视频 |
| 7. 停止录制 | `POST /api/v1/video/devices/{id}/record/stop` | 停止录制 |
| 8. 查询目录 | `POST /api/v1/video/devices/{id}/catalog` | GB28181 目录查询 |
| 9. 通道列表 | `GET /api/v1/video/devices/{id}/channels` | 查询视频通道 |

### GB28181 SIP 模拟

当视频设备选择 GB28181 接入方式时，模拟器内置完整的 SIP 设备端模拟（纯 Node.js 实现，无外部 SIP 依赖）：

| 功能 | 协议 | 说明 |
|------|------|------|
| REGISTER | SIP → 平台 | 设备注册/注销（Expires=0 注销），支持 Digest Auth |
| Keepalive | SIP MESSAGE → 平台 | 定时心跳（XML CmdType=Keepalive） |
| Catalog 响应 | SIP MESSAGE → 平台 | 自动回复平台的目录查询，返回模拟通道列表 |
| DeviceInfo 响应 | SIP MESSAGE → 平台 | 自动回复设备信息查询（厂商/型号/固件） |
| INVITE 应答 | 100 Trying + 200 OK + SDP ← 平台 | 自动接受平台点播请求，返回 SDP（sendonly） |
| BYE 应答 | 200 OK ← 平台 | 自动接受流停止请求 |
| PTZ 接收 | MESSAGE ← 平台 | 接收并记录平台下发的云台控制指令 |

**高级特性:**
- **SIP Digest 认证** — 自动处理 401/407 挑战，MD5 摘要计算（RFC 2617）
- **UDP + TCP 传输** — 可选 UDP（默认）或 TCP 传输
- **UDP 重传** — RFC 3261 Timer A/B，指数退避重传（500ms → 4s），32s 事务超时
- **自动续注册** — 在 Expires 到期前 80% 时自动刷新注册

**操作流程:**
1. 添加 Video 设备 → 选择 GB28181 → 配置 SIP 服务器地址/端口/ID/传输/密码
2. 连接设备（在平台注册视频设备）
3. 点击「SIP 注册」→ 发送 REGISTER 到平台 SIP 服务器（如需认证会自动完成）
4. 点击「开启心跳」→ 定时发送 Keepalive
5. 平台发送 Catalog/DeviceInfo/INVITE/BYE/PTZ 等指令时，模拟器自动响应

### SNMP Mode

Simulator tests SNMP device connectivity via the `firefly-connector` proxy:

| Step | API | Description |
|------|-----|-------------|
| 1. Test | `POST /api/v1/protocol/snmp/test` | Connectivity test (v1/v2c/v3) |
| 2. Read | `POST /api/v1/protocol/snmp/get` | Read OID value |
| 3. Walk | `POST /api/v1/protocol/snmp/walk` | Walk OID subtree |

### Modbus Mode

Simulator tests Modbus device connectivity via the `firefly-connector` proxy:

| Step | API | Description |
|------|-----|-------------|
| 1. Test | `POST /api/v1/protocol/modbus/test` | Connection test (TCP/RTU) |
| 2. Read | `POST /api/v1/protocol/modbus/read` | Read holding/input registers |
| 3. Write | `POST /api/v1/protocol/modbus/write` | Write registers |

### WebSocket Mode

Simulator connects to the `firefly-connector` WebSocket endpoint for real-time bidirectional messaging:

| Step | Description |
|------|-------------|
| 1. Connect | `ws://localhost:9070/ws/device` with deviceId/productId/tenantId params |
| 2. Send | JSON messages via WebSocket frame |
| 3. Receive | Real-time incoming messages displayed in panel |

### TCP/UDP Mode

Simulator connects to the `firefly-connector` Netty TCP/UDP server:

| Protocol | Default Port | Description |
|----------|-------------|-------------|
| TCP | 8900 | Line-delimited text messages via TCP socket |
| UDP | 8901 | Fire-and-forget UDP datagrams |

### LoRaWAN Mode

Simulator acts as a **LoRaWAN Network Server** by sending HTTP POST requests to the connector's webhook endpoint, simulating ChirpStack v4 compatible uplink events:

| Step | API | Description |
|------|-----|-------------|
| 1. Connect | (mark online) | No persistent connection needed |
| 2. Send Uplink | `POST /api/v1/lorawan/webhook/up` | ChirpStack v4 format with devEui, fPort, rxInfo, txInfo |

The simulated webhook body includes:
- `deviceInfo` (devEui, deviceName, applicationId)
- `fCnt`, `fPort`, `data` (base64), `object` (decoded JSON)
- `rxInfo` (gatewayId, RSSI, SNR)
- `txInfo` (frequency, modulation, dataRate)

## 数据模板

| 模板名称 | 类型 | 字段 |
|---------|------|------|
| 温湿度传感器 | 属性 | temperature, humidity |
| GPS 定位 | 属性 | latitude, longitude, speed |
| 电力监测 | 属性 | voltage, current, power |
| 光照传感器 | 属性 | illuminance, uv_index |
| 气体检测 | 属性 | co2, co, ch4, o2 |
| 水质监测 | 属性 | ph, dissolved_oxygen, turbidity, conductivity |
| 土壤传感器 | 属性 | soil_moisture, soil_temperature, soil_ph, soil_ec |
| 空气质量 | 属性 | pm25, pm10, aqi, tvoc |
| 智能电表 | 属性 | total_energy, voltage_a/b/c, current_a, power_factor |
| 振动传感器 | 属性 | velocity, acceleration, displacement, frequency |
| 告警事件 | 事件 | eventType, value, timestamp |
| 烟雾报警 | 事件 | smoke_level, alarm, battery, timestamp |
| OTA 升级进度 | OTA | version, progress, status, timestamp |

## 批量导入

支持通过 JSON 或 CSV 文件一次性导入多个设备。点击左侧设备列表的导入按钮选择文件。

### JSON 格式

```json
[
  {
    "name": "温湿度传感器-01",
    "protocol": "HTTP",
    "productKey": "pk_001",
    "deviceName": "dev_01",
    "deviceSecret": "secret_01",
    "httpBaseUrl": "http://localhost:9070"
  }
]
```

### CSV 格式

```csv
name,protocol,productKey,deviceName,deviceSecret,httpBaseUrl
温湿度传感器-01,HTTP,pk_001,dev_01,secret_01,http://localhost:9070
```

支持的字段: `name`, `protocol` (HTTP/MQTT/CoAP/Video/SNMP/Modbus/WebSocket/TCP/UDP/LoRaWAN), `productKey`, `deviceName`, `deviceSecret`, `httpBaseUrl`, `coapBaseUrl`, `mqttBrokerUrl`, `mqttClientId`, `mqttUsername`, `mqttPassword`, `tcpHost`, `tcpPort`, `udpHost`, `udpPort`, `loraWebhookUrl`, `loraDevEui`, `loraAppId`, `loraFPort`

示例文件: `samples/devices.json`, `samples/devices.csv`

## 压力测试

支持对所有在线设备 (HTTP/MQTT/CoAP/WebSocket/TCP/UDP/LoRaWAN) 并发发送数据。

1. 先添加并连接多个设备（支持批量导入）
2. 点击左下角 ⚗️ 按钮打开压力测试面板
3. 配置参数:
   - **并发设备数** — 每轮同时发送的设备数量 (1~100)
   - **发送轮次** — 重复发送的轮数 (1~1000)
   - **轮次间隔** — 每轮之间的等待时间 (ms)
   - **数据模板** — 使用哪个模板生成随机数据
   - **MQTT Topic** — MQTT 设备的发布 Topic，支持 `{productKey}` 和 `{deviceName}` 占位符
4. 实时查看统计: 总请求数、已发送、成功/失败、TPS、成功率、耗时
5. 支持中途停止

各协议压测行为:
- **HTTP** — 调用属性/事件上报 API (X-Device-Token)
- **CoAP** — 调用 CoAP Bridge 属性/事件上报 API (?token=)
- **MQTT** — 向配置的 Topic 发布 JSON payload (QoS 1)
- **WebSocket** — 通过 WebSocket 连接发送 JSON 消息
- **TCP** — 通过 TCP Socket 发送行分隔文本消息
- **UDP** — 通过 UDP 发送报文
- **LoRaWAN** — HTTP POST 模拟 ChirpStack v4 Webhook 上行数据

## 技术栈

- **Electron 33** — 桌面应用框架
- **React 18** + **TypeScript** — 前端 UI
- **Ant Design 5** — 组件库（暗色主题）
- **Zustand** — 状态管理
- **mqtt.js** — MQTT 客户端
- **Vite 6** — 开发构建
- **electron-builder** — 打包分发
- **动态注册昵称与删除闭环** 鈥?一型一密设备直接复用“模拟设备名称”作为平台 `nickname`，首次注册后复用 `deviceSecret`，删除时可同步删除平台侧动态注册设备

## 物模型 OpenAPI 签名拉取

- 物模型读取已不再使用旧的 `/api/v1/protocol/products/thing-model`
- 当前统一改为通过网关 OpenAPI 路径 `/open/DEVICE/api/v1/products/thing-model/by-product-key`
- 签名请求头为 `X-App-Key`、`X-Timestamp`、`X-Nonce`、`X-Signature`
- 签名计算放在 Electron 主进程，渲染进程只传网关地址、`productKey`、Access Key、Secret Key
- 设备配置新增以下字段，并随导入、导出、克隆一起持久化：
  - `openApiBaseUrl`
  - `openApiAccessKey`
  - `openApiSecretKey`
- 默认网关地址为 `http://localhost:8080`

## Session Persistence

- Device definitions are now persisted to an Electron user-data file, not only renderer localStorage.
- Restorable protocols automatically reconnect after the simulator is reopened if they were online before shutdown.
- Video devices are excluded from auto-restore to avoid duplicating server-side media resources.
