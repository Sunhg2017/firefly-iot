# 设备模拟器流程一致性优化设计

## 1. 背景

`firefly-simulator` 在设备接入、批量操作和日志统计上存在几处实现不一致的问题：

- MQTT 运行时事件同时在 `App.tsx` 和 `DeviceControlPanel.tsx` 订阅，容易造成日志重复、状态更新分散。
- 场景编排和压力测试把所有在线协议都视为可走通用上报链路，实际 `HTTP / MQTT / CoAP` 之外的协议并不共享这套发送实现。
- MQTT Topic 占位符替换错误地使用 `mqttUsername` / `mqttClientId`，和界面展示的业务身份 `productKey` / `deviceName` 不一致。
- 多处统计计数直接使用 `sentCount + 1` / `errorCount + 1`，在并发发送时存在覆盖风险。
- 批量连接按钮的可用范围和 `connectSimDevice()` 实际支持范围不一致，导致部分非视频协议无法批量接入。

## 2. 目标

- 统一 MQTT 日志、断连和异常处理入口。
- 让通用批量发送能力只覆盖真实支持的协议。
- 让 MQTT Topic 占位符回到业务身份口径。
- 收口设备发送成功/失败计数为原子累加。
- 让批量连接能力与运行时支持范围保持一致。

## 3. 范围

涉及文件：

- `firefly-simulator/src/App.tsx`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/utils/mqtt.ts`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/src/components/ScenarioPanel.tsx`
- `firefly-simulator/src/components/StressTestPanel.tsx`
- `firefly-simulator/src/components/protocol/SnmpControlPanel.tsx`
- `firefly-simulator/README.md`

不涉及：

- 后端接口、菜单权限、Flyway SQL、数据库结构
- 模拟器登录流程和环境管理逻辑
- 视频协议的专属媒体链路

## 4. 方案

### 4.1 MQTT 运行时事件统一处理

- 删除 `App.tsx` 中重复的 MQTT 订阅。
- 保留 `DeviceControlPanel.tsx` 作为统一运行时入口，同时处理：
  - 全局日志写入
  - 当前选中设备的 MQTT 消息面板
  - 断连后的状态回写和定时器清理
  - 异常后的错误状态和日志

### 4.2 MQTT Topic 占位符按业务身份替换

- 在 `src/utils/mqtt.ts` 增加 `interpolateMqttTopicTemplate()`。
- 占位符 `{productKey}`、`{deviceName}` 统一基于 `resolveMqttIdentity()` 解析。
- 场景编排、压力测试都复用同一套替换逻辑，不再读取 `mqttUsername` / `mqttClientId`。

### 4.3 通用发送能力只覆盖共享链路协议

- 场景编排发送步骤和压力测试统一只允许 `HTTP / MQTT / CoAP` 参与。
- 对在线但不支持通用发送的设备，只记录跳过日志，不再错误落到 HTTP 通用上报分支。
- Modbus、SNMP、WebSocket、TCP、UDP、LoRaWAN、Video 仍通过各自专属面板联调。

### 4.4 设备统计改为原子累加

- 在 Zustand store 中增加 `adjustDeviceStats(id, delta)`。
- 发送成功和失败统一走 store 内部累加，避免并发 Promise 覆盖旧值。
- SNMP、场景编排、压力测试、设备控制面板统一改为复用该方法。

### 4.5 批量连接范围与运行时能力对齐

- 基于 `isRestorableProtocol()` 计算可批量连接设备。
- 批量连接覆盖全部离线、可恢复、非视频协议设备。
- Video 设备仍排除在批量连接之外，避免在无人工确认时批量创建平台资产、推流和 SIP 会话。

## 5. 关键取舍

- 不为不支持通用上报的协议保留“HTTP 兜底发送”分支，直接收口到真实支持范围。
- 不继续沿用 `mqttUsername` / `mqttClientId` 作为 Topic 身份占位符来源，统一以业务身份为准。
- 批量连接继续排除 Video，避免把高成本外部副作用混入通用批量操作。

## 6. 风险与边界

- 如果历史导入的 MQTT 设备没有补齐 `productKey` / `deviceName`，Topic 占位符将无法正确展开，需要先补全设备身份字段。
- 压力测试和场景编排现在会明确跳过非共享链路协议，这属于行为收口，不再兼容旧的错误兜底路径。
- 本次不处理协议专属面板的发送模型差异，后续如需统一抽象，应基于各协议真实能力单独设计。
