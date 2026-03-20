# 设备模拟器下行验证与完整日志设计

> 版本: v1.0.0
> 日期: 2026-03-21
> 状态: Done

## 1. 背景

设备消息工作台已经支持通过平台下发属性设置、服务调用和通用下行消息，但设备模拟器存在两个影响联调的问题：

- 全局日志在接收 MQTT 消息时只保留 payload 前 200 个字符，长 JSON 无法完整核对。
- MQTT 设备连接后默认只订阅 `thing/service/+`，属性设置和通用下行主题不会自动接收。

这会导致设备侧虽然已经收到平台指令，联调人员仍然无法在模拟器里完整确认消息内容或判断不同下行类型。

## 2. 目标

- 设备模拟器全局日志必须保留完整 MQTT payload，不再裁剪长报文。
- MQTT 模拟设备连接后应自动覆盖平台当前使用的三类下行主题：
  - `/sys/{productKey}/{deviceName}/thing/property/set`
  - `/sys/{productKey}/{deviceName}/thing/service/+`
  - `/sys/{productKey}/{deviceName}/thing/downstream`
- 日志中要能直接区分“属性设置下行”“服务调用下行”“通用下行”，降低人工辨认 topic 的成本。

## 3. 范围

本次只调整桌面端设备模拟器：

- `firefly-simulator/src/App.tsx`
- `firefly-simulator/src/components/LogPanel.tsx`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/utils/mqtt.ts`
- `firefly-simulator/src/utils/runtime.ts`

不涉及：

- 平台后端下行消息路由改造
- 设备侧自动应答能力扩展
- 数据库结构、Flyway 或权限台账变更

## 4. 设计说明

### 4.1 完整日志链路

- `App.tsx` 不再使用 `payload.slice(0, 200)` 裁剪 MQTT 消息。
- 新增 `buildMqttInboundLogMessage(...)`，统一生成“消息类型 + topic + payload”的多行日志文本。
- `LogPanel.tsx` 改为块状多行渲染，启用 `whiteSpace: pre-wrap` 和 `overflowWrap: anywhere`，确保长 JSON 可以完整换行显示。

### 4.2 默认下行订阅收口

- 在 `mqtt.ts` 中新增 `buildDefaultMqttSubscriptions(...)`，统一维护模拟器默认订阅计划。
- 手动连接路径 `DeviceControlPanel.connectMqtt(...)` 和自动恢复路径 `runtime.connectSimDevice(...)` 共同复用这套订阅计划。
- 这样可以避免手动连接与自动恢复使用不同订阅口径，造成“重启后只能收到部分下行”的回归问题。

### 4.3 下行类型识别

- 在 `mqtt.ts` 中按 topic action 解析消息类别。
- 当前内置识别范围：
  - `thing/property/set` -> 属性设置下行
  - `thing/service/invoke` -> 服务调用下行
  - `thing/downstream` -> 通用下行
  - 兼容展示属性上报、事件上报和 reply 类消息标签

## 5. 关键取舍

- 本次优先解决“收到并看清楚”问题，不新增自动回执逻辑。
- 服务调用主题继续保留 `thing/service/+` 通配形式，兼容当前 `invoke` 口径和后续扩展的服务子主题。
- 日志展示优先可读性，不再强制单行收口；如需归档仍可通过导出按钮获取原文。

## 6. 风险与边界

- 当前修复保证模拟器能自动接收并展示平台下行消息，但不会自动上报 `thing/property/set/reply` 或 `thing/service/reply`。
- 若用户手工订阅了额外 topic，本次实现不会覆盖自定义订阅，只补默认主题集合。
- 如果平台未来新增新的下行 topic family，需要同步扩充 `buildDefaultMqttSubscriptions(...)`。

## 7. 验证

执行：

```bash
cd firefly-simulator
npm run build:vite
```

手工回归：

1. 连接一个 MQTT 模拟设备。
2. 在设备消息工作台分别发送属性设置、服务调用、通用下行三类消息。
3. 确认模拟器日志区能看到完整 payload，且日志标签与下行类型一致。
4. 重新打开模拟器并恢复连接，确认自动恢复后的 MQTT 设备仍能收到上述三类下行消息。
