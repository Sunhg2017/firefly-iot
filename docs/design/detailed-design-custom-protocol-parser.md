# Firefly IoT 自定义协议解析详细设计

> 版本: v2.1.0
> 日期: 2026-03-10
> 状态: Delivered

## 1. 设计目标

自定义协议解析模块已经完成一期尾项、二期、三期目标，当前设计文档以仓库内已落地实现为准，不再停留在预研口径。

本轮补充的重点设计约束如下：

- 前端页面尽量不向用户暴露系统数据库主键。
- 规则配置中的业务标识统一优先使用 `tenantCode` 与 `productKey`。
- 协议解析页优先采用下拉和模板，减少手工输入。
- 对复杂逻辑、页面联动和运行时交互补充必要注释与说明。

## 2. 范围总览

### 2.1 一期能力

- 协议解析规则定义、保存、发布、回滚、启停、版本历史。
- 设备定位器持久化与管理接口。
- MQTT、HTTP、WebSocket、CoAP、TCP、UDP 统一进入上行解析链路。
- TCP/UDP 分帧能力接入运行时。
- 上行在线调试能力。

### 2.2 二期能力

- 下行编码模型与编码测试接口。
- Script 模式下 `encode(ctx)` 执行。
- Plugin SPI、运行时插件注册表、插件重载与插件目录视图。
- 运行时指标采集与前端展示。
- MQTT 下行编码接入自定义编码链路。

### 2.3 三期能力

- 租户默认规则 `TENANT` scope。
- 灰度发布 `ALL / DEVICE_LIST / HASH_PERCENT`。
- 轻量可视化编排 `visualConfigJson` 与一键生成 `scriptContent`。
- 运行时面板、插件目录、插件热重载。

## 3. 核心设计

### 3.1 作用域模型

规则仍然保留后端内部作用域字段：

- `scopeType`
  - `PRODUCT`
  - `TENANT`
- `scopeId`
  - 后端内部锚点字段。
  - `PRODUCT` 规则默认取 `productId`。
  - `TENANT` 规则默认取当前租户 ID。

设计约束：

- `scopeId` 继续作为后端内部归属字段存在。
- 前端不再把 `scopeId` 当作用户显式输入项。
- 页面统一展示业务可识别信息：
  - 租户默认级显示 `tenantCode`
  - 产品级显示 `产品名称 + productKey`

这样可以避免让用户理解和依赖内部主键，同时不破坏现有后端数据模型与查询逻辑。

### 3.2 协议与传输方式的区分

`protocol` 与 `transport` 不是重复字段，职责如下：

- `protocol`
  - 表示协议族或适配器类别。
  - 例如 `TCP_UDP`、`MQTT`、`HTTP`。
- `transport`
  - 表示运行时实际传输通道。
  - 例如 `TCP`、`UDP`、`MQTT`、`HTTP`。

重点说明：

- 在 MQTT、HTTP、CoAP 等场景下，这两个字段的值看起来可能相同，但语义并不相同。
- 在 TCP/UDP 适配器下，`protocol = TCP_UDP`，而 `transport` 需要明确区分 `TCP` 或 `UDP`。
- 运行时匹配器和分帧引擎都需要这两个维度，因此前端保留双字段，但补充中文说明，降低误解。

### 3.3 业务唯一键优先原则

为了减少主键暴露，当前页面采用以下设计：

- 产品选择使用下拉框，标签展示 `产品名称 (productKey)`。
- 规则列表、弹窗标题、调试入口不再展示规则内部 ID。
- `parserConfigJson` 会自动补齐：
  - `tenantCode`
  - `productKey`

自动补齐时机：

- 新建规则弹窗初始化。
- 编辑已有规则加载详情。
- 应用预置模板。
- 点击解析配置预设按钮。
- 编辑过程中切换作用域或产品。
- 最终提交保存前再次兜底同步。

兜底原则：

- 产品级规则补齐 `tenantCode + productKey`。
- 租户默认级规则保留 `tenantCode`，并主动移除 `productKey`，避免脏值残留。

### 3.4 前端交互优化

自定义协议解析页的交互设计遵循“优先选择、少填少错”的原则：

- 筛选条件优先使用下拉选择。
- 新建和编辑规则支持模板一键填充。
- `matchRuleJson`、`frameConfigJson`、`parserConfigJson`、`releaseConfigJson` 均提供预设按钮。
- 插件模式优先从运行时已安装插件或插件目录中选择 `pluginId` 和版本。
- 调试弹窗中的产品选择改为下拉，不再要求手输产品 ID。
- 页面文案统一中文化，与整站风格保持一致。

### 3.5 复杂联动说明

前端页存在两个必须明确记录的复杂联动点：

1. `parserConfigJson` 的业务标识同步
   - 当作用域、产品或租户上下文变化时，页面会同步修正 `tenantCode` 与 `productKey`。
   - 保存前再次做一次兜底注入，确保最终持久化配置不残留错误业务标识。

2. 调试场景的租户默认规则选择
   - 租户默认规则本身不绑定单一产品。
   - 但调试和运行时匹配通常需要明确产品上下文。
   - 因此前端在调试弹窗中保留“调试产品”选择项。

## 4. 运行时执行链路

```mermaid
flowchart LR
  A["Protocol Adapter<br/>MQTT/HTTP/CoAP/TCP/UDP/WebSocket"] --> B["FrameDecodeEngine"]
  B --> C["ProtocolParseEngine"]
  C --> D["DeviceIdentityResolveService"]
  D --> E["ProtocolParserMatcher"]
  E --> F["Script / Plugin / Builtin"]
  F --> G["Normalize DeviceMessage"]
  G --> H["DeviceMessageProducer / Runtime"]

  I["ProtocolDownlinkEncodeService"] --> J["MQTT / Connector Downlink"]
  K["ProtocolParserPluginRegistry"] --> F
```

执行特性：

- 上行链路与调试接口共用解析核心逻辑。
- 下行编码与编码测试接口共用编码链路。
- 已发布版本才参与运行时匹配。
- 产品级规则优先于租户默认级规则。
- 灰度发布在“已发布规则集合内部”进行命中决策。

## 5. 数据与接口设计

### 5.1 规则定义关键字段

- `productId`
  - 后端内部关联产品。
  - 前端不以裸 ID 向用户展示。
- `scopeType`
  - 规则作用域。
- `scopeId`
  - 后端内部字段，前端隐藏。
- `protocol`
  - 协议族。
- `transport`
  - 运行时传输方式。
- `direction`
  - `UPLINK / DOWNLINK`
- `parserMode`
  - `SCRIPT / PLUGIN / BUILTIN`
- `frameMode`
  - `NONE / DELIMITER / FIXED_LENGTH / LENGTH_FIELD`
- `parserConfigJson`
  - 运行时 `ctx.config`
  - 当前要求包含业务唯一键信息

### 5.2 前端与后端契约

本次优化不改动后端主接口契约：

- 管理接口仍按规则 `id` 读写详情、发布、回滚、启停。
- 前端页面只是不再把这些内部主键直接暴露给用户。
- 调试与保存提交仍可以继续传递后端所需内部字段。

这样可以兼顾：

- 已有服务逻辑稳定性
- 前端用户体验
- 后续逐步向业务唯一键演进的可实施性

## 6. 页面字段口径

### 6.1 “作用域 ID”

- 含义：后端内部归属字段。
- 当前口径：用户无需手工填写。
- 页面行为：隐藏，不再作为主交互项。

### 6.2 “协议”

- 用于选择协议族或适配器类别。
- 例：`TCP_UDP`、`MQTT`、`HTTP`。

### 6.3 “传输方式”

- 用于选择运行时实际通道。
- 例：`TCP`、`UDP`、`MQTT`、`HTTP`。

### 6.4 “调试产品”

- 产品级规则会自动带出对应产品。
- 租户默认级规则调试时需要用户明确选择产品上下文。

## 7. 设计结果

通过本轮收口，自定义协议解析功能在设计上达到以下状态：

- 功能范围完整覆盖一期、二期、三期目标。
- 页面交互符合“少输入、少暴露主键、优先业务键”的规则。
- 复杂联动点已在代码和文档中补充说明。
- 既保留现有后端稳定契约，又把前端展示口径收敛到业务可理解信息。

## 2026-03-12 Runtime Hardening Update

### Scope

This update aligns management, debug, and runtime behavior for custom protocol parsing and closes several unsafe edge cases.

### Key Design Changes

- `errorPolicy` is now enforced in runtime parse decisions:
  - `ERROR`: mark parse failure and continue trying later candidates; if no candidate succeeds and no RAW fallback is allowed, return handled-empty.
  - `DROP`: stop immediately and return handled-empty.
  - `RAW_DATA`: continue candidate traversal and allow raw pipeline fallback (`notHandled`) when no parser succeeds.
- Parser candidate traversal no longer short-circuits on first failure under `ERROR`; later matching candidates can still succeed.
- TCP/UDP frame decode now filters parser definitions by release strategy (`ALL` / `DEVICE_LIST` / `HASH_PERCENT`) when device context is known.
- Session frame reassembly introduces bounded remainder protection:
  - supports `frameConfig.maxBufferedBytes`
  - overflow clears session remainder and drops the oversized partial frame.
- Debug frame splitting is isolated from production sessions; debug calls no longer write to runtime TCP/UDP session buffers.
- `BUILTIN` parser mode is explicitly rejected in management validation. Current supported modes are `SCRIPT` and `PLUGIN`.
- Script parser execution now runs in a bounded executor with queue limits and timeout-triggered cancellation to prevent unbounded resource growth.

### Compatibility Notes

- Existing `SCRIPT` and `PLUGIN` published rules remain compatible.
- Rules configured with `parserMode=BUILTIN` must be migrated to `SCRIPT` or `PLUGIN`.
