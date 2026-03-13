# 设备影子版本稳定性修复设计说明
> 模块: firefly-device / firefly-simulator
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备断开连接后，设备影子 `version` 仍在持续增长。排查发现这是两个问题叠加造成的：

- 模拟器在 MQTT / WebSocket / TCP 被动断开时，只更新了设备状态，没有停止自动上报定时器。
- 服务端影子 `reported` 更新即使内容完全没变，也会无条件递增版本。

## 2. 不合理点

- 设备已离线时，自动上报继续触发属性上报，不符合设备生命周期预期。
- 影子版本用于表达状态变更，重复写入相同 `reported` 内容仍持续加一，会放大噪声并误导排障。

## 3. 修复方案

### 3.1 模拟器侧

- 为设备控制面板增加统一的自动上报停止函数。
- 设备收到 MQTT / WebSocket / TCP 断开事件时，立即停止自动上报并清理定时器状态。
- 手动断开时同样先停止自动上报。
- 定时器触发发送前再次检查设备实时状态；若已离线，则自动停止上报，不再继续发送。

### 3.2 服务端影子侧

- `DeviceShadowService.updateReported(...)` 在合并后的 `reported` 状态与当前状态完全一致时，直接返回当前影子，不再递增版本。
- 只有 `reported` 实际发生变化时，才更新 Redis、metadata 和 version。

## 4. 影响范围

- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceShadowService.java`
