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
