# 设备消息路由补全设计说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

`MessageRouterService` 之前只有属性上报和事件上报两条主链路是完整的，其余分支虽然已经有方法入口，但大多只记录日志，没有真正执行业务处理：

- `DEVICE_ONLINE` / `DEVICE_OFFLINE` 没有更新设备在线状态与时间
- `SERVICE_REPLY` 没有进入统一事件日志
- `PROPERTY_SET_REPLY` 没有收敛设备影子 `desired` / `reported`
- `OTA_PROGRESS` 没有沉淀为可查询事件

这会导致平台界面和实际链路脱节，尤其是设备生命周期、影子同步和 OTA 追踪会显得“不完整”。

## 2. 目标

- 补齐 `MessageRouterService` 各消息类型的真实处理逻辑
- 保持消息仍可继续转发到规则引擎
- 尽量复用已有设备数据、影子、设备状态能力，避免在路由层堆底层逻辑
- 为后续协议接入和规则引擎联动保留一致的消息语义

## 3. 设计方案

### 3.1 生命周期消息

- `DEVICE_ONLINE`
  - 更新设备 `onlineStatus = ONLINE`
  - 更新 `lastOnlineAt`
  - 写入一条运维事件 `DEVICE_ONLINE`
  - 转发到规则引擎

- `DEVICE_OFFLINE`
  - 更新设备 `onlineStatus = OFFLINE`
  - 更新 `lastOfflineAt`
  - 写入一条运维事件 `DEVICE_OFFLINE`
  - 转发到规则引擎

为了适配 Kafka 异步消费场景，设备状态更新不依赖 `AppContextHolder`，而是通过设备真实 `tenantId + deviceId` 做归属校验。

### 3.2 属性设置回执

新增 `DeviceShadowService.applyPropertySetReply(...)`：

- 把回执中的属性同步到 `reported`
- 把 `desired` 中已经被确认成功的属性移除
- 仅在影子实际发生变化时增加版本号

这样可以避免“设备已经确认执行，但影子里 `desired` 仍残留”的问题。

### 3.3 服务回执与 OTA 进度

新增 `DeviceDataService.writeOperationalEventFromMessage(...)`，把以下消息统一沉淀到 `device_events`：

- `SERVICE_REPLY`
- `PROPERTY_SET_REPLY`
- `OTA_PROGRESS`
- `DEVICE_ONLINE`
- `DEVICE_OFFLINE`

这些消息虽然不一定属于业务事件，但对平台运维和联调非常重要，应该进入统一事件视图。

### 3.4 路由层职责边界

`MessageRouterService` 只负责：

- 判断消息类型
- 组织调用设备状态、设备数据、设备影子服务
- 保证消息继续转发到 `rule.engine.input`

底层数据落库、状态更新、影子收敛都下沉到专门服务中，避免路由层越来越重。

## 4. 影响范围

- [MessageRouterService.java](/E:/codeRepo/service/firefly-iot/firefly-device/src/main/java/com/songhg/firefly/iot/device/service/MessageRouterService.java)
- [DeviceService.java](/E:/codeRepo/service/firefly-iot/firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java)
- [DeviceDataService.java](/E:/codeRepo/service/firefly-iot/firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceDataService.java)
- [DeviceShadowService.java](/E:/codeRepo/service/firefly-iot/firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceShadowService.java)
- [MessageRouterServiceTest.java](/E:/codeRepo/service/firefly-iot/firefly-device/src/test/java/com/songhg/firefly/iot/device/service/MessageRouterServiceTest.java)

## 5. 风险与取舍

- 生命周期和回执消息现在会进入事件表，事件量会比之前更多，但这是可观测性换取的必要成本。
- `PROPERTY_SET_REPLY` 的影子收敛按“确认值与 `desired` 相同才移除”的保守策略处理，避免误删未真正生效的期望值。
- 生命周期和回执消息继续转发规则引擎，后续可以直接做在线离线告警或 OTA 异常规则。

## 6. 验证

补充的测试覆盖：

- 属性上报仍会落遥测、更新影子并转发规则引擎
- 事件上报仍会落事件并转发规则引擎
- 上线消息会更新连接状态并写运维事件
- 属性设置回执会收敛影子并写运维事件
- OTA 进度会写运维事件并继续转发
