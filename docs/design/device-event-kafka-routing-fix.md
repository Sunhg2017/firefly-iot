# 设备事件 Kafka 循环投递修复设计说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备事件上报后，`firefly-device` 会消费 `device.event.report`，再把消息转发给规则引擎。

此前转发逻辑虽然把目标 topic 设置成了 `rule.engine.input`，但实际仍调用了按消息类型自动选 topic 的 `publishUpstream()`。  
由于 `EVENT_REPORT` 会被重新路由回 `device.event.report`，同一条事件消息会再次被当前服务消费，形成 Kafka 自循环投递。

## 2. 设计目标

- 设备事件和属性上报转发到规则引擎时，必须使用显式目标 topic。
- 不改变外部设备接入链路现有的“按消息类型自动路由”行为。
- 补充自动化回归测试，防止后续再次把内部转发接回 `publishUpstream()`。

## 3. 修复方案

- 在 `DeviceMessageProducer` 中新增 `publishToTopic(String topic, DeviceMessage message)`。
- `MessageRouterService.forwardToRuleEngine(...)` 改为显式调用 `publishToTopic(KafkaTopics.RULE_ENGINE_INPUT, ...)`。
- 保留 `publishUpstream()` 原有语义，避免误把协议原始 topic 当成 Kafka 目标 topic 使用。
- 新增 `MessageRouterServiceTest`，校验 `EVENT_REPORT` 只会被投递到规则引擎输入 topic，不再重新发布到设备事件 topic。

## 4. 影响范围

- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceMessageProducer.java`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/MessageRouterService.java`
- `firefly-device/src/test/java/com/songhg/firefly/iot/device/service/MessageRouterServiceTest.java`
