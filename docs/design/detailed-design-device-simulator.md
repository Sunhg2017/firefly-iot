# Firefly-IoT 设备模拟器详细设计

> 版本: v1.0.0
> 日期: 2026-03-13
> 状态: Done

## 1. 背景

设备模拟器已经覆盖 HTTP、MQTT、CoAP、视频、SNMP、Modbus、WebSocket、TCP、UDP、LoRaWAN 等协议，但“新建模拟设备”入口存在几个明显不合理点：

- 使用单个弹窗承载所有协议字段，信息量过大，用户很难快速完成配置。
- 协议选项直接平铺，缺少协议说明和分模块引导，不符合当前仓库“复杂表单使用抽屉、长表单拆步骤”的规则。
- WebSocket 等少数协议需要内部识别参数，但原来和主流程字段混在一起，增加误填概率。
- 设备列表入口仍以英文为主，和主系统现有中文页面不一致。

## 2. 设计目标

- 将新建设备改为抽屉式分步配置，先选协议，再录入最小必填项，最后维护高级参数。
- 用户可回退到已经配置过的步骤继续修改。
- 把协议说明前置，减少“先填后错”的试错成本。
- 把内部性、低频字段收口到高级步骤，不干扰主路径。
- 统一设备列表入口的中文口径，和主系统现有页面保持一致。

## 3. 范围

本次变更覆盖：

- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/README.md`

本次不包含：

- 模拟器协议能力扩展
- 平台侧新增查询接口
- 导入导出机制重构

## 4. 交互设计

### 4.1 新建设备抽屉

新增入口从弹窗改为抽屉，宽度扩大以承载复杂协议配置，并拆分为三步：

1. 基本信息
   - 模拟设备名称
   - 接入协议
   - 当前协议说明
2. 接入参数
   - 按协议只展示当前真正需要的最小参数
3. 扩展配置
   - MQTT 高级连接参数
   - GB28181 SIP 与通道配置
   - WebSocket 内部识别参数
   - 配置摘要

### 4.2 步骤规则

- 下一步前只校验当前步骤相关字段。
- 已经完成的步骤支持回退修改。
- 最终创建前校验整个表单。
- 抽屉头部、内容区和底部操作栏统一使用深色主题，避免底部操作区沿用组件默认浅色背景，破坏整体界面一致性。
- 协议说明卡片和配置摘要卡片也统一收口为深色面板，避免在深色抽屉中出现突兀的浅色信息块。
- 设备控制区优先展示“接入概览”，把服务地址、业务标识、密钥状态等信息收口成信息卡片，再展示数据上报区和协议专属控制区，降低同屏阅读负担。
- HTTP / CoAP / MQTT 连接前先在客户端做缺参拦截，避免空三元组或空地址继续打到服务端，造成“服务端拿不到认证参数”的误判。

## 5. 协议分层设计

### 5.1 通用原则

- HTTP / CoAP / MQTT 继续沿用现有平台的 `productKey + deviceName + secret` 口径。
- HTTP 认证请求兼容 body + query 双通道取参，模拟器和 connector 同步补强，减少不同链路上的取参差异。
- HTTP 增加独立认证方式切换：一机一密直接使用 `deviceSecret`，一型一密先走动态注册，再回填 `deviceSecret` 进入 HTTP 鉴权，不把注册和认证混进同一个接口。
- 视频设备先区分 `GB28181` 和 `RTSP_PROXY`，再分别展示对应配置。
- WebSocket 保留内部识别参数，但移入高级步骤，避免用户一进来就看到内部字段。

### 5.2 MQTT

- 接入参数阶段只保留：
  - `productKey`
  - `deviceName`
  - 认证方式
  - 动态注册地址或 `deviceSecret`
  - `mqttBrokerUrl`
- 扩展配置阶段再维护：
  - `clientId`
  - `username`
  - `password`
  - clean session
  - keepalive
  - last will

### 5.3 视频

- 接入参数阶段：
  - 媒体服务地址
  - 视频模式
  - 国标设备 ID / RTSP 地址
- 扩展配置阶段：
  - SIP 服务参数
  - SIP 通道列表

### 5.4 WebSocket

- `/ws/device` 当前仍依赖 `deviceId`、`productId`、`tenantId` 建立上下文。
- 这些字段属于连接识别参数，不再出现在主配置步骤，而是放入高级步骤集中说明。

## 6. 设备列表优化

设备列表本次主要做了两类调整：

- 将入口按钮、筛选项、批量操作、空态和操作提示统一为中文口径。
- 保留原有批量连接、批量断开、导入导出和复制能力，不改变数据结构。

## 6.1 设备管理器样式重构

本次继续对设备管理器主视角做了布局和视觉升级：

- 整体从平铺深色面板调整为“左侧管理器 + 右侧工作区 + 底部统计条”的玻璃态布局。
- 左侧设备管理器增加总览卡片，先展示总量、在线、离线、异常，再进入筛选和设备目录。
- 设备项从普通列表改为状态卡片，突出协议、状态、关键标识和已发送次数。
- 右侧未选中设备时补充引导型空态，避免一整块空白区域。
- 底部状态栏改为统计胶囊条，汇总协议分布、发送总量和快捷键。

该调整目标不是单纯换皮，而是让用户先看全局，再选设备，再进入操作。

## 7. 关键设计取舍

- 没有强行把 WebSocket 内部参数改成业务唯一键，因为当前 connector 连接处理器本身就以这些参数建立上下文，前端暂时无法完全消除，只能降噪收口。
- 没有引入额外平台同步接口，因为本次目标是先把现有模拟器体验和规则对齐，避免为模拟器单独引入新的后端依赖。

## 8. 风险与后续建议

- 新建设备抽屉在关闭时会销毁表单，因此页面侧改为维护一份表单快照，避免继续监听未挂载的 `Form` 实例并触发 `useForm` 连接告警。
- 模拟器入口页已补充显式 CSP，开发态默认不再依赖“无策略”模式运行。
- 设备管理器当前使用较多内联样式，后续如继续扩展主题体系，可考虑抽出统一的桌面端 design token。
- 如果后续平台为模拟器补充“从产品/设备列表选择”的桌面接口，可继续减少手工输入。
- WebSocket 连接若未来改成业务唯一键口径，模拟器高级步骤应同步收口。
- 设备导入目前仍是本地工具导入逻辑，后续若需要与平台任务中心统一，需要单独设计桌面端流程。
## 9. 2026-03-14 增补

### 9.1 自动注册昵称

- 模拟器设备继续保留 `nickname` 字段，用于一型一密动态注册时写入平台设备昵称。
- 页面不再单独提供 `Nickname` 输入框，而是直接复用“模拟设备名称”作为平台设备昵称来源，避免重复录入。
- 第三步“配置摘要”中不再重复拆成两行，而是统一展示为“模拟设备名称 / 平台设备昵称”。
- 动态注册请求统一透传 `productKey + productSecret + deviceName + nickname`。

### 9.2 动态注册生命周期

- 模拟器本地新增 `dynamicRegistered` 标识，只在动态注册真正成功后置为 `true`。
- 一型一密设备在已经拿到 `deviceSecret` 后，后续连接直接复用该密钥，不再重复调用动态注册接口。
- 这样可以避免“首次连接成功、再次连接因设备名已存在而失败”的回归问题。

### 9.3 删除联动

- 删除模拟器设备时，如果该设备是模拟器动态注册创建的，则先调用 connector 的 `/api/v1/protocol/device/unregister`。
- connector 再调用 device 内部接口，按 `productKey + productSecret + deviceName` 校验并删除平台设备。
- 删除平台设备时继续复用 `DeviceService.deleteDevice(...)`，确保设备定位器、设备数量统计和软删除逻辑保持一致。


## 10. 2026-03-19 设备模拟器物模型联动与生命周期事件

### 10.1 背景

- 设备模拟器原先只能基于本地固定模板随机生成属性和事件数据，无法反映产品真实物模型，调试价值有限。
- 平台已将内置 `ip` 属性以及 `online`、`offline`、`heartbeat` 生命周期事件纳入物模型默认定义，模拟器也需要按同一口径工作。
- 模拟器是设备侧调试工具，不应依赖平台管理端登录态，因此需要提供按 `productKey` 读取物模型的设备侧只读链路。

### 10.2 目标

- 让 HTTP、CoAP、MQTT 模拟设备在“数据上报”面板中直接按产品物模型生成随机属性/事件 payload。
- 设备连接成功后补发 `online` 事件，手工断开前补发 `offline` 事件。
- 设备在线期间按固定周期自动发送 `heartbeat` 事件；HTTP 同时调用 `/api/v1/protocol/http/heartbeat` 刷新在线状态。
- 物模型获取链路只依赖 `productKey`，便于未发布产品、动态注册场景和本地联调场景使用。

### 10.3 后端链路设计

- `firefly-device`
  - 新增 `GET /api/v1/internal/products/{id}/basic`，继续承接服务间读取产品基础信息。
  - 新增 `GET /api/v1/internal/products/thing-model?productKey=...`，支持按 `productKey` 读取产品物模型。
  - `ProductService.getThingModelByProductKey(...)` 复用现有物模型解析与写回逻辑，统一补齐内置 `ip / online / offline / heartbeat`。
  - 数据库侧通过 Flyway 将 `devices(product_id, device_name)` 的旧唯一约束收口为 `deleted_at IS NULL` 条件唯一索引，保证逻辑删除后的设备名可复用。
- `firefly-api`
  - `ProductClient` 的 Feign 路径收口到 `/api/v1/internal/products`，并新增 `getThingModelByProductKey(...)`。
- `firefly-connector`
  - 新增 `GET /api/v1/protocol/products/thing-model?productKey=...`。
  - connector 通过 `ProductClient` 转调 device 服务，对设备侧调试工具暴露只读物模型能力。

### 10.4 模拟器实现

- `DeviceControlPanel` 不再依赖本地随机模板来驱动默认数据模拟，而是加载产品物模型后生成候选属性、事件列表。
- 数据源切换为“物模型模拟 / 自定义 JSON”。
  - 物模型模拟时，属性支持“全部属性”或单个属性。
  - 事件支持选择具体事件，并根据 `outputData` 自动生成字段。
- 新增生命周期事件发送辅助方法，统一封装 `identifier`、`eventType`、`eventName`、`timestamp`、`occurredAt`、`protocol`、`productKey`、`deviceName`、`ip` 等字段。
- 新增心跳定时器状态，跟随设备在线状态启动和停止。

### 10.5 随机值生成策略

- `int`：按 `min/max` 生成随机整数，默认范围 `0..100`。
- `float / double`：按 `min/max/precision` 生成随机浮点数，默认保留 2 位小数。
- `bool`：随机 `true/false`。
- `enum`：优先使用物模型 `values` 中定义的候选项。
- `date`：使用当前毫秒时间戳。
- `string`：默认生成随机字符串；`ip` 标识符单独生成 IPv4 地址。
- `array / struct`：递归按子类型和字段定义生成示例值。

### 10.6 生命周期事件策略

- 连接成功
  - HTTP 鉴权成功后立即发送 `online` 事件。
  - CoAP 鉴权成功后立即发送 `online` 事件。
  - MQTT 建连成功后立即发送 `online` 事件。
- 动态注册恢复
  - 对 HTTP / MQTT 一型一密设备，如果本地缓存的 `DeviceSecret` 已失效，例如服务端设备已被删除，模拟器会在鉴权失败后自动再执行一次动态注册并刷新本地密钥。
- 主动断开
  - 在手工点击 `Disconnect` 时，先尝试发送 `offline` 事件，再执行协议断连。
  - MQTT 如果是异常掉线，连接已关闭后无法保证再补发 `offline`，这是协议边界。
- 心跳
  - HTTP / CoAP / MQTT 设备在线时自动启动心跳定时器。
  - 默认周期 30 秒，可选 `15 / 30 / 60 / 120 / 300` 秒。
  - HTTP 心跳会同时发送 `heartbeat` 事件，并调用 `/api/v1/protocol/http/heartbeat` 刷新 connector 侧在线状态。

### 10.7 交互设计

- 当物模型存在可选项时，默认进入“物模型模拟”模式。
- 控制面板展示随机样例预览，便于用户在发送前确认 payload 结构。
- 当产品还未配置对应属性或事件时，界面自动提示切换为自定义 JSON，避免空发送。

### 10.8 边界与风险

- 物模型读取链路要求模拟器能访问 connector；若 `baseUrl` 未配置或 connector 未发布对应接口，将退化为自定义 JSON。
- MQTT 异常断线无法 100% 保证补发 `offline` 事件，只能在主动断开路径上保证。
- 自动心跳与自动上报都依赖本地定时器，若桌面进程被挂起或退出，事件发送会随之停止。
## 11. 2026-03-19 物模型字段规则与影子同步补充

## 11. 2026-03-19 物模型字段规则与影子同步补充

### 11.1 新增目标

- 物模型模拟不再只有“按数据类型随机”这一种策略，而是允许针对字段单独配置规则。
- 单次发送、自动上报和预览必须共用同一套字段规则，避免预览和真实上报不一致。
- 设备属性上报进入服务端后，影子 `reported` 更新不能再依赖时序数据落库成功。

### 11.2 模拟规则模型

- 规则按“设备维度”持久化，存放在模拟器设备配置的 `thingModelSimulationRules` 中。
- 规则键使用物模型字段路径：
  - 属性：`property:{identifier}`
  - 嵌套字段：`property:{identifier}.child`、`property:{identifier}[].child`
  - 事件输出字段：`event:{eventIdentifier}.field`
- 字段描述由物模型递归展开生成，属性支持根字段与结构体/数组子字段，事件支持 `outputData` 字段。

### 11.3 规则类型

- `random`
  - 使用物模型原有的 `min/max/precision/length/enum` 定义生成值。
  - 字符串额外支持 `random` 与 `ip` 两种生成器。
  - 数组额外支持最小长度和最大长度。
- `range`
  - 适用于 `int / float / double / date`。
  - 允许覆盖字段默认范围，浮点型额外允许覆盖精度。
- `fixed`
  - 标量字段直接使用固定值。
  - `array / struct` 使用固定 JSON，便于构造稳定的复合报文。

### 11.4 前端交互收口

- 规则编辑入口直接放在 `DeviceControlPanel` 的“物模型模拟”区域内，不新增独立弹窗。
- 当前所选属性、全部属性或当前事件的字段规则会即时联动显示。
- 导入、导出、克隆设备时会一并保留字段规则，保证调试模板可复用。

### 11.5 服务端影子同步修正

- `MessageRouterService.handlePropertyReport(...)` 先对属性 payload 做归一化：
  - 平铺属性 map 直接使用。
  - 若上报格式带 `params` 或 `properties` 包裹层，则先提取真实属性集。
- 时序写入 `deviceDataService.writeTelemetryFromMessage(...)` 与影子写入 `shadowService.updateReported(...)` 改为分别保护。
- 即使时序库写入失败，影子 `reported` 仍会继续更新，保证控制台调试和影子观测不被联动故障阻断。

### 11.6 涉及文件

- `firefly-simulator/src/utils/thingModel.ts`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/MessageRouterService.java`
- `firefly-device/src/test/java/com/songhg/firefly/iot/device/service/MessageRouterServiceTest.java`
