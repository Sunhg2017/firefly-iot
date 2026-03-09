# 自定义协议解析运维说明

## 1. 文档目的

本文档用于说明自定义协议解析模块的部署、发布、重载、验证、排障与回滚方法，适用于平台运维、实施和联调支持人员。

## 2. 组件范围

涉及模块：

- `firefly-device`
- `firefly-connector`
- `firefly-plugin-api`
- `firefly-web`

涉及页面：

- 设备中心 -> 协议解析
- 设备中心 -> 设备管理 -> 定位器

涉及接口：

- `/api/v1/protocol-parsers/*`
- `/api/v1/protocol-parsers/runtime/*`
- `/api/v1/devices/{deviceId}/locators`

## 3. 日常操作流程

### 3.1 新增或修改规则

1. 在协议解析页面新建或编辑规则。
2. 先保存草稿。
3. 使用上行调试或下行编码调试验证规则。
4. 点击发布。
5. 根据需要启用或停用规则。

### 3.2 发布后的系统行为

- Device 服务会发送协议规则变更事件。
- Connector 收到事件后刷新运行时缓存。
- `TENANT` 级规则会触发全量失效。
- 已发布版本会参与运行时匹配，草稿版本不会直接生效。

### 3.3 回滚流程

1. 在规则列表中打开“版本”确认目标版本号。
2. 点击“回滚”，选择目标版本。
3. 系统会根据历史快照生成新的草稿版本。
4. 对回滚后的草稿再次调试、发布、启用。

## 4. 插件部署

### 4.1 支持的插件来源

- Connector classpath 内置插件
- `plugins/protocol-parsers/*.jar`

### 4.2 插件部署步骤

1. 将协议插件 JAR 放入 `plugins/protocol-parsers/` 目录，或随 Connector 一起打包到 classpath。
2. 确认插件实现了 `ProtocolParserPlugin` SPI。
3. 确认 JAR 中包含正确的 `META-INF/services` 声明。
4. 在页面点击“刷新运行时”确认插件目录可见。
5. 点击“重载插件”让运行时加载新插件。

### 4.3 页面校验点

运行时面板需要确认：

- “已安装插件”中能看到目标 `pluginId`
- 版本号正确
- 支持能力与预期一致
- 来源位置与部署目录一致

## 5. 验证清单

### 5.1 页面侧验证

- 规则已保存成功
- 调试成功
- 规则已发布
- 规则状态为 `ENABLED`
- 运行时面板计数器有增长

### 5.2 接口侧验证

可调用以下接口检查：

- `GET /api/v1/protocol-parsers/runtime/plugins`
- `GET /api/v1/protocol-parsers/runtime/plugins/catalog`
- `GET /api/v1/protocol-parsers/runtime/metrics`
- `GET /api/v1/protocol-parsers/{id}`
- `GET /api/v1/protocol-parsers/{id}/versions`

## 6. 常见问题排查

### 6.1 规则未命中

优先检查：

- `scopeType` 是否正确
- `productId` 是否正确
- `direction` 是否正确
- `matchRuleJson` 是否和实际 topic、header、messageType 一致
- 是否已经发布并启用

### 6.2 调试成功但正式链路没有数据

优先检查：

- 当前生效版本是否已发布
- 规则状态是否为 `ENABLED`
- 灰度规则是否排除了当前设备
- Connector 是否已收到缓存刷新事件
- Connector 节点是否为预期节点

### 6.3 TCP/UDP 解析异常

优先检查：

- `frameMode` 是否正确
- `frameConfigJson` 是否和设备报文结构一致
- 调试使用的 `payloadEncoding` 是否与实际报文一致
- 是否存在半包、粘包、长度字段偏移错误

### 6.4 插件已上传但页面看不到

优先检查：

- JAR 是否放在 `plugins/protocol-parsers/`
- `META-INF/services` 是否正确
- 是否执行过“重载插件”
- 插件是否只依赖平台允许的公共 API

### 6.5 下行编码结果不符合预期

优先检查：

- `messageType` 是否和匹配条件一致
- `parserConfigJson` 是否包含默认主题、编码方式或帧头参数
- `scriptContent` 或插件 `encode(ctx)` 是否按设备协议输出
- 调试入参中的 `payloadText` 结构是否与脚本约定一致

## 7. 监控与巡检

协议解析运行时面板建议纳入日常巡检：

- 解析次数
- 编码次数
- 调试成功次数
- 平均解析耗时
- 平均编码耗时
- transport 维度计数器
- 已安装插件数量

建议巡检频率：

- 上线当日：每小时检查一次
- 稳定期：每日检查一次
- 大版本发布后：重点检查发布后 30 分钟内指标变化

## 8. 常用命令

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

## 9. 变更建议

- 规则变更先走小范围灰度，再做全量发布。
- 高风险协议调整前，先导出当前脚本和版本号。
- 插件升级前保留上一版 JAR，便于快速回退。
- 复杂协议优先补充脚本/插件注释，避免二次接手时难以定位问题。
