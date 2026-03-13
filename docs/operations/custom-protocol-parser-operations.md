# 自定义协议解析运维说明

## 1. 文档目标

本文档用于说明自定义协议解析模块的部署、验证、日常操作、排障与回滚方法，适用于实施、运维、联调和值班人员。

## 2. 涉及范围

相关模块：

- `firefly-device`
- `firefly-connector`
- `firefly-plugin-api`
- `firefly-web`

相关页面：

- 设备中心 -> 自定义协议解析
- 设备中心 -> 设备管理 -> 定位器

相关接口：

- `/api/v1/protocol-parsers/*`
- `/api/v1/protocol-parsers/runtime/*`
- `/api/v1/devices/{deviceId}/locators`

## 3. 日常操作流程

### 3.1 新建或修改规则

1. 进入“自定义协议解析”页面。
2. 优先选择模板，再微调字段。
3. 根据规则范围选择作用域：
   - 单产品规则选择“产品级”
   - 租户默认规则选择“租户默认级”
4. 保存草稿。
5. 使用上行调试或下行编码测试验证。
6. 发布规则。
7. 按需启用或停用。

### 3.2 发布后的系统行为

- Device 服务发送协议规则变更事件。
- Connector 收到事件后刷新运行时缓存。
- `TENANT` 规则会触发租户级默认规则失效与重建。
- 已发布版本进入运行时匹配集合，草稿版本不会直接生效。

### 3.3 回滚流程

1. 打开目标规则的“版本历史”。
2. 选择需要回滚到的版本号。
3. 系统根据历史快照生成新的草稿版本。
4. 对回滚后的草稿重新调试、发布、启用。

## 4. 页面使用口径

### 4.1 主键不外露

当前页面遵循以下口径：

- 不再要求用户填写 `scopeId`。
- 列表和弹窗标题不再突出显示内部规则主键。
- 产品选择统一使用下拉，显示 `产品名称 (productKey)`。
- `parserConfigJson` 自动补齐 `tenantCode` 与 `productKey`。

运维侧需要明确：

- 后端仍然保留 `scopeId`、`productId` 等内部字段。
- 这些字段主要用于服务内部归属与查询，不建议作为页面操作依据。

### 4.2 协议与传输方式

- `协议` 表示协议族，例如 `TCP_UDP`、`MQTT`、`HTTP`。
- `传输方式` 表示实际传输通道，例如 `TCP`、`UDP`、`MQTT`。

注意：

- MQTT、HTTP、CoAP 场景下，这两个字段可能值相同。
- TCP/UDP 场景下必须区分：
  - `protocol = TCP_UDP`
  - `transport = TCP` 或 `UDP`

### 4.3 租户默认规则调试

租户默认规则不直接绑定单一产品，因此：

- 页面编辑时无需选择产品。
- 调试时仍建议选择“调试产品”，补齐运行时上下文。

## 5. 插件部署

### 5.1 支持来源

- Connector classpath 内置插件
- `plugins/protocol-parsers/*.jar`

### 5.2 部署步骤

1. 将协议插件 JAR 放入 `plugins/protocol-parsers/`，或随 Connector 一起打包到 classpath。
2. 确认插件实现 `ProtocolParserPlugin` SPI。
3. 确认 JAR 内包含正确的 `META-INF/services` 声明。
4. 打开协议解析页的运行时面板，确认插件目录可见。
5. 点击“重载插件”让运行时加载新插件。

### 5.3 页面核验点

- “已安装插件”中可看到目标 `pluginId`
- 版本号正确
- 支持能力与预期一致
- 来源路径与部署位置一致

## 6. 验证清单

### 6.1 页面侧

- 规则可保存
- 上行调试成功
- 下行编码测试成功
- 规则已发布
- 规则状态为 `ENABLED`
- 运行时面板指标有变化
- 产品展示为 `产品名称 (productKey)`，而不是裸主键

### 6.2 接口侧

可检查以下接口：

- `GET /api/v1/protocol-parsers/runtime/plugins`
- `GET /api/v1/protocol-parsers/runtime/plugins/catalog`
- `GET /api/v1/protocol-parsers/runtime/metrics`
- `GET /api/v1/protocol-parsers/{id}`
- `GET /api/v1/protocol-parsers/{id}/versions`

## 7. 常见问题排查

### 7.1 页面没有显示“作用域 ID”

不是缺失，是设计调整：

- `scopeId` 属于后端内部字段
- 前端页面改为展示 `tenantCode` 或 `productKey`
- 如需确认内部归属，请通过后端接口或数据库排查

### 7.2 `tenantCode` 或 `productKey` 没有自动补齐

优先检查：

- 当前租户信息接口 `/tenant` 是否正常
- 产品列表是否加载成功
- 当前规则是否已正确选择产品
- 是否在保存前修改了非法 JSON，导致配置无法正常解析

### 7.3 调试成功但正式链路没有生效

优先检查：

- 当前生效版本是否已发布
- 规则状态是否为 `ENABLED`
- 灰度发布是否排除了当前设备
- Connector 是否收到缓存刷新事件
- 正式报文的 `protocol / transport / topic / headers` 是否与规则匹配

### 7.4 TCP/UDP 解析异常

优先检查：

- `protocol` 是否为 `TCP_UDP`
- `transport` 是否正确选择为 `TCP` 或 `UDP`
- `frameMode` 是否正确
- `frameConfigJson` 是否与实际报文格式一致
- 调试使用的 `payloadEncoding` 是否与真实报文一致

### 7.5 下行编码结果不符合预期

优先检查：

- `messageType` 是否与匹配条件一致
- `parserConfigJson` 中的默认主题、编码方式、请求头参数是否正确
- Script 或插件中的 `encode(ctx)` 输出是否符合设备协议
- 调试输入的 `payloadText` 是否与脚本约定一致

## 8. 巡检建议

建议将协议解析运行时面板纳入日常巡检：

- 解析成功次数
- 解析异常次数
- 编码成功次数
- 编码异常次数
- 调试成功次数
- 平均解析耗时
- 平均编码耗时
- transport 维度计数器
- 已安装插件数量

建议频率：

- 上线当日：每小时检查一次
- 稳定期：每天检查一次
- 大版本发布后：重点检查发布后 30 分钟内指标变化

## 9. 常用命令

前端构建验证：

```bash
cd firefly-web
npm run build
```

后端编译与测试：

```bash
mvn -pl firefly-device,firefly-connector -am test
mvn -pl firefly-system -am -DskipTests compile
```

## 10. 运维建议

- 规则变更优先走小范围灰度，再做全量发布。
- 高风险协议调整前，先记录当前脚本、版本号和产品范围。
- 插件升级前保留上一版 JAR，便于快速回退。
- 联调时优先使用页面下拉与模板，不要依赖内部主键记忆操作。
- 如需定位复杂问题，先看业务键：
  - `tenantCode`
  - `productKey`
  - `deviceName`

## 2026-03-12 Operations Update

### Runtime Behavior Changes

- Frame decoding now respects release strategies during parser definition selection when device context can be resolved.
- Parser failure policy is now effective at runtime:
  - `ERROR`: continue next parser, final fallback is handled-empty on accumulated parser errors.
  - `DROP`: immediate handled-empty.
  - `RAW_DATA`: allow raw pipeline fallback (`notHandled`).
- Parser traversal is no longer first-failure short-circuit under `ERROR`.

### New/Updated Guardrails

- Session remainder buffering is bounded:
  - optional `frameConfig.maxBufferedBytes`
  - if omitted, runtime uses internal safe defaults.
- On remainder overflow, runtime logs warning and clears session remainder to prevent memory growth.
  - Typical log pattern: `Discard oversized frame remainder`.
- Script execution uses bounded worker pool and bounded queue.
  - When saturated, runtime returns busy failure instead of unbounded queuing.

### Debug Isolation

- Protocol debug frame split does not reuse production `sessionId` buffers anymore.
- Debug half-packet testing no longer contaminates online TCP/UDP stream sessions.

### Mode Availability

- Management now rejects `parserMode=BUILTIN`.
- Supported production modes: `SCRIPT`, `PLUGIN`.

### Recommended Checks After Upgrade

1. Verify no active draft/published definitions still use `BUILTIN`.
2. For TCP/UDP long-frame protocols, explicitly set `frameConfig.maxBufferedBytes`.
3. Confirm expected fallback behavior per rule (`ERROR`, `DROP`, `RAW_DATA`) in debug and production.
4. Watch parser warnings and executor busy logs during traffic peaks.

## 2026-03-13 Debug Operations Update

### Changed Behavior

- Uplink debug:
  - no longer supports manual device override in the management page
  - device identity must come from payload, topic, headers, or locator rules
- Downlink debug:
  - device selection is now based on `deviceName`
  - operators should choose debug product first, then choose device name

### Operational Checks

1. If uplink debug cannot identify the device, first inspect whether payload examples still carry the expected identity fields such as `deviceName` or locator values.
2. If downlink debug reports that the selected device does not exist, verify:
   - the selected debug product is correct
   - the device still belongs to that product
   - the device name has not been renamed
3. For `DEVICE_LIST` release configs, prefer maintaining `deviceNames` in new and updated rules.

### Compatibility Note

- Legacy release configs that still contain `deviceIds` remain compatible during downlink debug because the device service resolves `deviceName` to internal device context before invoking connector encode debug.

## 2026-03-13 协议解析抽屉运维更新

### 页面行为变化

- 协议解析规则的新建和编辑改为分步抽屉，不再一次性展示整张长表单。
- 页面步骤固定为：
  1. 模板与作用域
  2. 协议与匹配
  3. 解析实现
  4. 发布策略
  5. 预览确认

### 运维关注点

- 步骤切换不应丢失已填写表单值；如果用户反馈“切到下一步后内容被清空”，优先检查前端是否误恢复了 `preserve={false}`。
- 步骤化只调整前端交互，不改变 `/api/v1/protocol-parsers/*` 的保存、查询、发布、回滚接口契约。
- 模板应用、产品联动、`tenantCode/productKey` 自动补齐、脚本/插件模式切换、发布配置预设都仍然保留。

### 回归检查

1. 新建规则时，从步骤 1 逐步前进，确认当前步骤校验生效，未配置后续内容时不会提前报错。
2. 在步骤 2、3、4 填写内容后返回上一步，再回到当前步骤，确认 JSON、脚本、插件和发布配置仍然保留。
3. 在最终“预览确认”页核对摘要与配置预览，保存后确认接口入参与旧版本一致。
4. 分别验证 `SCRIPT` 与 `PLUGIN` 两种模式都可正常保存。
5. 构建验证执行：

```bash
cd firefly-web
npm run build
```

### 故障排查建议

- 如果用户反映“下一步无法继续”，先检查当前步骤必填字段是否完整，再查看浏览器控制台是否有表单渲染错误。
- 如果用户反映“步骤点击跳转异常”，重点检查 `editorStepIndex / editorMaxStepIndex` 状态流转是否被破坏。
- 如果用户反映“确认页内容不对”，优先核对表单当前值、模板应用逻辑和业务标识补齐逻辑是否仍然生效。

## 2026-03-13 协议解析编辑器运维更新

### 变化说明

- 协议解析规则页面的 JSON 和脚本字段已从普通多行输入框切换为 Monaco Editor。
- 编辑器支持：
  - JSON / JavaScript 语法高亮
  - JSON 字段结构提示
  - 脚本片段补全与 `ctx` 上下文提示

### 运维关注点

- 编辑器资源采用懒加载，首次进入相关步骤时会额外下载编辑器 chunk 和 worker 文件，这是预期行为。
- 编辑器资源已按 Monaco 包装层、编辑器核心、JSON 能力和基础语言能力拆分，协议解析页不再一次性加载全量语言包。
- 如果页面出现“编辑器区域空白”或“只显示加载中”，优先检查前端静态资源是否完整发布，以及浏览器控制台是否存在 worker 加载失败。
- 如果 JSON 提示缺失但编辑器能正常输入，优先检查 `monaco-editor` 相关资源是否被代理或静态资源策略拦截。

### 回归验证

1. 打开协议解析规则抽屉，进入 JSON 编辑步骤，确认编辑区具备语法高亮。
2. 在 JSON 中输入属性名开头，确认能出现字段自动提示。
3. 在脚本编辑区输入 `parse` 或 `encode`，确认能出现代码片段建议。
4. 保存规则后再次进入编辑，确认编辑器能正常回显已有内容。
5. 首次进入脚本或 JSON 编辑步骤时，网络面板应仅看到 Monaco 相关懒加载 chunk 和 worker 文件被按需拉取。
6. 构建验证：

```bash
cd firefly-web
npm run build
```

### 依赖变化

- 前端新增依赖：
  - `@monaco-editor/react`
  - `monaco-editor`

## 2026-03-13 协议解析页面结构运维更新

### 页面变化

- 协议解析页面主体已经拆为两个标签页：
  - `规则维护`
  - `运行时状态`
- 顶部新增总览区，统一展示当前租户、产品筛选、规则数量和已加载插件数。
- 顶部总览区在页面上固定命名为“页面总览”，规则筛选区域命名为“筛选条件”。

### 运维影响

- 日常规则维护、筛选和列表操作都集中在“规则维护”标签页。
- 插件列表、插件目录、运行时指标和插件重载操作集中在“运行时状态”标签页。
- 如果用户反馈“运行时面板不见了”，优先确认是否处于“规则维护”标签页。

### 回归检查

1. 默认进入页面时，应落在“规则维护”标签页。
2. 切换到“运行时状态”后，应能看到运行时指标、插件列表和插件目录。
3. 回到“规则维护”后，应能看到“筛选条件”卡片和规则列表，且列表分页行为保持正常。
4. 页面顶部应始终显示“页面总览”，切换标签页后不应消失。
5. 构建验证：

```bash
cd firefly-web
npm run build
```
