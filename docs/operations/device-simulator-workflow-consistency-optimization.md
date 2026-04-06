# 设备模拟器流程一致性优化运维说明

## 1. 适用范围

本文档用于 `firefly-simulator` 完成流程一致性优化后的构建、验证、发布和排障。

## 2. 发布内容

本次发布包含以下行为调整：

- MQTT 运行时日志、断连和异常处理统一收口到设备控制面板
- 场景编排和压力测试只覆盖 `HTTP / MQTT / CoAP` 通用上报链路
- MQTT Topic 占位符改为按 `productKey / deviceName` 替换
- 设备发送成功/失败统计改为原子累加
- 批量连接扩展为全部离线、可恢复、非视频协议设备
- `firefly-simulator/README.md` 与 `docs/` 三类文档同步更新

本次不涉及数据库、Flyway、菜单权限和后端接口变更。

## 3. 依赖条件

- Node.js 与 npm 可用
- `firefly-simulator` 依赖安装完整
- Electron / Vite 构建链路正常

## 4. 验证步骤

执行构建：

```bash
cd firefly-simulator
npm run build:vite
```

建议手工回归：

1. 创建或导入一组混合协议设备，至少包含 `HTTP`、`MQTT`、`CoAP`、`SNMP` 或 `Modbus`，以及 1 台 `Video`。
2. 在设备列表点击“批量连接”，确认除 `Video` 外的离线可恢复协议设备都会被纳入批量连接。
3. 让 MQTT 设备接收一条下行消息，确认全局日志只记录一次，且当前设备详情页的 MQTT 消息列表同步出现该消息。
4. 主动断开 MQTT 连接或制造 MQTT 异常，确认设备状态回写为 `offline` 或 `error`，并且自动上报、心跳定时器被停止。
5. 打开场景编排，在混合协议设备上执行发送步骤，确认 `HTTP / MQTT / CoAP` 正常发送，其他在线协议只记“已跳过”日志。
6. 打开压力测试，当在线设备只剩非 `HTTP / MQTT / CoAP` 协议时，应提示当前没有可压测设备；混合协议下只统计三类可压测设备。
7. 在多轮发送后检查设备统计，确认 `sentCount` / `errorCount` 会持续累加，不会出现回退或覆盖。

## 5. 常见故障

### 5.1 MQTT Topic 占位符展开后为空

排查项：

- 设备是否补齐 `productKey` 与 `deviceName`
- 导入数据是否只填了 `mqttUsername` 或 `mqttClientId`
- 当前场景编排 / 压测配置中的 Topic 模板是否仍包含 `{productKey}`、`{deviceName}` 以外的自定义占位符

### 5.2 场景编排或压力测试提示设备不可用

排查项：

- 设备是否已经在线
- 设备协议是否属于 `HTTP / MQTT / CoAP`
- 是否误把协议专属联调需求放进通用发送链路

### 5.3 批量连接未覆盖预期设备

排查项：

- 设备当前是否处于 `offline`
- 协议是否属于可恢复协议
- `Video` 设备默认不会进入批量连接范围，这是预期行为

### 5.4 构建失败

排查项：

- `node_modules` 是否完整
- TypeScript 报错是否来自改动后的监听逻辑或新文档引用
- Vite / Electron 构建缓存是否需要清理

## 6. 回滚说明

如需回滚，需同时回滚以下文件：

- `firefly-simulator/src/App.tsx`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/utils/mqtt.ts`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/src/components/ScenarioPanel.tsx`
- `firefly-simulator/src/components/StressTestPanel.tsx`
- `firefly-simulator/src/components/protocol/SnmpControlPanel.tsx`
- `firefly-simulator/README.md`
- `docs/design/device-simulator-workflow-consistency-optimization.md`
- `docs/operations/device-simulator-workflow-consistency-optimization.md`
- `docs/user-guide/device-simulator-workflow-consistency-optimization.md`

回滚后重新执行：

```bash
cd firefly-simulator
npm run build:vite
```

## 7. 运维提醒

- 本次属于前端桌面端模拟器行为收口，发布后用户会直接感知到场景编排、压力测试和批量连接的可用范围变化。
- 如果本地仍保留旧设备草稿，建议检查 MQTT 设备的 `productKey / deviceName` 是否完整，避免沿用旧的错误 Topic 占位符口径。
