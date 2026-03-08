# 自定义协议解析进度暂存

更新时间：2026-03-09

## 当前结论

- 后端核心能力完成度约 80%-85%。
- 按“业务可自助配置并上线使用”的端到端 V1 口径，整体完成度约 65%-70%。
- 当前最关键的剩余项不是 TCP/UDP 绑定，而是 `frameMode / frameConfigJson` 还没有真正进入运行时拆包链路。

## 已完成

### Device 服务侧

- 已完成协议解析定义表、版本表、设备定位表迁移。
- 已完成协议解析定义的创建、查询、更新、调试、发布、回滚、启用、停用。
- 已完成内部接口：
  - `/api/v1/internal/protocol-parsers/products/{productId}/published`
  - `/api/v1/internal/device-auth/resolve-by-locator`
- 已完成发布变更事件发送，用于 Connector 缓存失效。

### Connector 侧

- 已完成解析引擎主链路：
  - 已发布规则拉取与本地缓存
  - 规则匹配
  - Script Parser 执行
  - 设备身份解析
  - 统一归一化为 `DeviceMessage`
- 已完成内部调试执行接口：
  - `/api/v1/internal/protocol-parsers/debug`
- 已完成脚本执行器优化：
  - GraalJS 预热
  - 脚本源码缓存
  - 解析超时控制
- 已完成解析变更事件消费与缓存失效。

### 协议接入侧

- MQTT 已接入自定义解析链路。
- HTTP 已接入自定义解析链路。
- WebSocket 已接入自定义解析链路。
- TCP/UDP 已接入自定义解析链路。
- TCP/UDP 已补充“手动绑定产品/设备上下文”能力，支持在无标准报文头场景下驱动自定义解析。

### TCP/UDP 绑定能力

- 后端已完成：
  - TCP 会话绑定/解绑接口
  - UDP 端点绑定/解绑接口
  - 绑定上下文模型
  - 绑定服务
  - 协议适配器中自动注入绑定上下文
- 前端已完成：
  - TCP/UDP 页面显示绑定状态
  - TCP/UDP 页面支持绑定、重绑、解绑
  - 绑定弹窗支持填写 `productId`，可选 `deviceId / deviceName`

## 已验证

- `mvn -pl firefly-connector -am test`
- `mvn -pl firefly-device,firefly-connector -am test`
- `npm run build`（目录：`firefly-web`）

已覆盖的关键测试包括：

- `ProtocolParserServiceTest`
- `ProtocolParseEngineTest`
- `DeviceIdentityResolveServiceTest`
- `TcpUdpBindingServiceTest`
- `TcpUdpProtocolAdapterTest`

## 当前缺口

### 1. V1 最大缺口：拆包规则尚未真正落地到运行时

虽然 Device 侧已经支持保存 `frameMode` 和 `frameConfigJson`，但 Connector 当前运行时还没有真正按规则执行拆包。

现状：

- `ProtocolParseEngine` 当前只执行 `SCRIPT` 模式。
- 规则匹配只使用 `protocol / transport / direction / matchRuleJson`。
- 没有真正消费 `frameMode / frameConfigJson`。
- TCP 当前仍主要依赖 `TcpServer` 的全局端口级解码配置，而不是“按产品规则拆包”。

这部分完成前，TCP/UDP 自定义协议解析还不能算真正闭环。

### 2. 协议解析管理前端尚未完成

当前 Web 端还没有协议解析管理页面，包括：

- 列表页
- 新建/编辑页
- 调试入口
- 发布/回滚/启停操作
- 与权限资源联动的菜单入口

目前只有 TCP/UDP 绑定页已补齐，协议解析本身的配置能力仍主要停留在后端。

### 3. `device_locators` 维护入口缺失

当前只完成了：

- 表结构
- 内部解析 RPC
- Connector 按 locator 查设备

但还缺少业务可操作的维护能力，例如：

- 设备定位器新增/修改/删除接口
- 产品或设备维度的定位器维护入口
- 前端录入页

这会限制 `BY_LOCATOR` 在真实业务中的可用性。

### 4. CoAP 尚未明确接入新解析链路

如果按文档的一期范围严格执行，多协议统一解析应尽量覆盖到 CoAP；当前已确认 MQTT / HTTP / WebSocket / TCP/UDP 已接入，CoAP 还需要单独核对并补齐。

## 明天建议直接续做的顺序

1. 先补 `frameMode / frameConfigJson` 的运行时能力
2. 再补协议解析管理前端页面与 API 封装
3. 视时间补 `device_locators` 维护接口和前端入口
4. 最后补 controller/integration 级测试，收 V1

## 建议的下一步最小切口

明天优先做“V1 最小可交付拆包闭环”：

- Connector 增加基于规则的帧拆包能力
- 先支持 `NONE / DELIMITER / FIXED_LENGTH / LENGTH_FIELD`
- 先优先打通 TCP
- UDP 保持单包直接进入解析

完成这一段后，再做协议解析管理前端，性价比最高。

## 关键文件

- `firefly-device/src/main/java/com/songhg/firefly/iot/device/protocolparser/service/ProtocolParserService.java`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/protocolparser/service/DeviceLocatorService.java`
- `firefly-device/src/main/resources/db/migration/V12__init_protocol_parsers.sql`
- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/parser/service/ProtocolParseEngine.java`
- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/parser/executor/ScriptParserExecutor.java`
- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/tcpudp/TcpUdpProtocolAdapter.java`
- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/tcpudp/TcpUdpBindingService.java`
- `firefly-web/src/pages/tcpudp/TcpUdpPage.tsx`

