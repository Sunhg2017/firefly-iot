# 自定义协议解析进度状态

更新时间: 2026-03-10

## 当前结论

自定义协议解析已完成一期尾项、二期、三期的目标范围，当前状态为“已交付并通过构建/测试验证”。

关联提交:

- `8bbc92a feat: complete custom protocol parser runtime`

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
- 可视化编排最小可用方案:
  - `visualConfigJson`
  - 一键生成 `scriptContent`
- 插件目录、插件重载、插件目录视图、运行时面板。

### 配套收口

- 默认租户管理员权限只保留一处配置来源，不再依赖 `application.yml`。
- 协议解析页和设备定位器页已经接入前端菜单与路由。

## 已验证

- `cd firefly-web && npm run build`
- `mvn -pl firefly-device,firefly-connector -am test`
- `mvn -pl firefly-system -am -DskipTests compile`

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

如果后续继续迭代，建议作为增强项而不是补漏项处理:

- 远程插件仓库与插件签名校验。
- 拖拽式可视化编排 DSL。
- 更细粒度的运行时指标落盘与告警联动。
- 插件治理页面。

## 建议口径

后续对外和团队内部均可按“自定义协议解析功能已完整可用”口径推进，不再按“在建能力”描述。
