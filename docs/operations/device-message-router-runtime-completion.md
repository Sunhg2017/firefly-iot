# 设备消息路由补全运维说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 适用场景

用于排查以下问题：

- 设备已经上下线，但设备管理页在线状态没有变化
- 属性设置成功了，但设备影子 `desired` 仍一直不消失
- OTA 有进度上报，但平台事件记录里看不到
- 服务调用回执没有进入平台可观测链路

## 2. 本次变更内容

- 生命周期消息会更新设备在线状态和上下线时间
- 生命周期、服务回执、属性设置回执、OTA 进度会写入 `device_events`
- 属性设置回执会同步收敛设备影子
- 上述消息仍会继续转发到规则引擎输入 topic

## 3. 验证方式

### 3.1 自动化验证

```bash
cd firefly-device
mvn test "-Dtest=MessageRouterServiceTest"
```

### 3.2 联调验证

1. 发送一条 `DEVICE_ONLINE` 消息
2. 检查设备在线状态是否变为 `ONLINE`
3. 检查 `lastOnlineAt` 是否更新
4. 检查设备事件列表是否出现 `DEVICE_ONLINE`
5. 发送一条 `PROPERTY_SET_REPLY`
6. 检查影子 `desired` 是否移除已确认项，`reported` 是否同步
7. 发送一条 `OTA_PROGRESS`
8. 检查设备事件列表是否出现对应进度记录

## 4. 常见排查点

### 4.1 在线状态没有变化

- 检查 Kafka 是否有 `device.lifecycle` 消息
- 检查消息里的 `tenantId` 和 `deviceId` 是否与真实设备一致
- 检查设备是否已被逻辑删除

### 4.2 影子 `desired` 不收敛

- 检查 `PROPERTY_SET_REPLY` 的 payload 是否带回了真实确认值
- 当前逻辑只有在“确认值与 `desired` 中的值相同”时才会移除该键

### 4.3 OTA 进度或服务回执看不到

- 检查消息类型是否分别为 `OTA_PROGRESS`、`SERVICE_REPLY`
- 检查消息是否已经进入 `firefly-device` 消费日志
- 检查 `device_events` 表是否有插入异常

## 5. 日志关注点

重点查看：

- `Routing message: type=...`
- `Device online: deviceId=...`
- `Device offline: deviceId=...`
- `Property set reply: deviceId=...`
- `OTA progress: deviceId=...`

错误日志重点查看：

- `Failed to update device connection state`
- `Failed to persist operational event`
- `Failed to reconcile property set reply`

## 6. 回滚说明

如果需要回滚本次补全，需要一起回滚：

- `MessageRouterService` 新增分支处理
- `DeviceService.updateRuntimeConnectionState(...)`
- `DeviceDataService.writeOperationalEventFromMessage(...)`
- `DeviceShadowService.applyPropertySetReply(...)`

只回滚其中一部分，会导致设备状态、影子、事件日志三者不一致。
