# 自定义协议解析进度状态

更新时间: 2026-03-10

## 当前结论

自定义协议解析已完成一期尾项、二期、三期的目标范围，当前状态为“已交付并完成页面交互收口”。

## 本轮新增收口

- 协议解析页隐藏 `scopeId`，不再要求用户理解或录入内部作用域主键。
- 规则列表、弹窗标题、调试入口改为优先展示业务可识别信息。
- `parserConfigJson` 自动补齐 `tenantCode` 与 `productKey`。
- 调试弹窗中的产品输入改为下拉选择，减少手工输入。
- 页面补充“协议”和“传输方式”的中文说明，降低字段歧义。
- 相关设计、运维、使用文档已同步刷新到 `docs/` 目录。

## 已完成范围

### 一期

- 协议规则定义、发布、回滚、版本历史。
- 设备定位器表、服务、控制器、前端管理入口。
- MQTT、HTTP、WebSocket、CoAP、TCP、UDP 统一接入上行解析链路。
- TCP/UDP 分帧能力落地。
- 上行在线调试能力。

### 二期

- 下行编码模型与调试接口。
- Script `encode(ctx)` 执行。
- Plugin SPI 与运行时插件注册表。
- 运行时指标采集。
- MQTT 下行编码接入。

### 三期

- 租户默认规则 `TENANT` scope。
- 灰度发布 `ALL / DEVICE_LIST / HASH_PERCENT`。
- 可视化编排最小可用方案：
  - `visualConfigJson`
  - 一键生成 `scriptContent`
- 插件目录、插件重载、插件目录视图、运行时面板。

### 配套收口

- 默认租户管理员权限只保留一处配置来源，不再依赖 `application.yml`。
- 协议解析页和设备定位器页已经接入前端菜单与路由。
- 页面交互遵循“尽量不向用户暴露主键、优先使用业务唯一键”的规则。

## 已验证

- `cd firefly-web && npm run build`
- 页面文档同步至：
  - `docs/design/detailed-design-custom-protocol-parser.md`
  - `docs/operations/custom-protocol-parser-operations.md`
  - `docs/user-guide/custom-protocol-parser-guide.md`

## 关键交付文件

- `firefly-device/.../ProtocolParserService.java`
- `firefly-device/.../ProtocolParserDebugService.java`
- `firefly-device/.../DeviceLocatorService.java`
- `firefly-device/.../ProtocolParserRuntimeController.java`
- `firefly-connector/.../ProtocolParseEngine.java`
- `firefly-connector/.../FrameDecodeEngine.java`
- `firefly-connector/.../ProtocolDownlinkEncodeService.java`
- `firefly-connector/.../ProtocolParserPluginRegistry.java`
- `firefly-web/src/pages/protocol-parser/ProtocolParserPage.tsx`
- `firefly-web/src/pages/device/DeviceLocatorModal.tsx`

## 当前剩余事项

没有阻塞上线的功能性缺口。

后续如继续增强，建议作为迭代项处理：

- 远程插件仓库与插件签名校验。
- 拖拽式可视化编排 DSL。
- 更细粒度的运行时指标落盘与告警联动。
- 设备级调试辅助选择器。

## 建议口径

当前可以按“自定义协议解析功能已完整可用，且页面交互已收口到业务唯一键口径”对内外同步，不再按“在建能力”描述。
