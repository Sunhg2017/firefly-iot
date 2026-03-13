# 设备影子上报日志级别收敛设计说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备属性上报会频繁触发 `DeviceShadowService.updateReported(...)`。此前该方法在每次成功写入影子 reported 后都输出一条 `INFO` 日志：

`Device shadow reported updated: deviceId=?, version=?`

在设备持续上报场景下，这类正常成功日志会快速刷屏，淹没有效告警与异常信息。

## 2. 问题分析

- `reported` 更新属于高频正常路径，不适合作为默认 `INFO` 日志长期保留。
- 真正需要重点关注的是更新失败、序列化失败、路由异常等异常路径。
- 影子 `desired` 更新通常由平台侧操作触发，频率较低，保留 `INFO` 更合理；`reported` 则应降级处理。

## 3. 修复方案

- 将 `DeviceShadowService.updateReported(...)` 的成功日志从 `INFO` 调整为 `DEBUG`。
- 保留异常路径 `ERROR` 日志不变，避免影响问题排查。

## 4. 影响范围

- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceShadowService.java`
- 设备影子上报相关服务端日志输出
