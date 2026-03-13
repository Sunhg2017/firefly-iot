# 设备事件 Kafka 循环投递修复运维说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 适用场景

用于排查以下现象：

- 设备只上报了一次事件，但 Kafka 中 `device.event.report` 持续刷屏。
- `firefly-device` 日志里同一个 `messageId` 被重复消费。
- 规则引擎没有明显处理结果，但设备事件消费线程持续繁忙。

## 2. 修复内容

- 规则引擎转发不再复用按消息类型自动路由的方法。
- `EVENT_REPORT` 和 `PROPERTY_REPORT` 转发规则引擎时改为显式投递到 `rule.engine.input`。
- 增加回归测试，防止内部转发再次被路由回 `device.event.report`。

## 3. 验证步骤

```bash
cd firefly-device
mvn test "-Dtest=MessageRouterServiceTest"
```

如需联调验证：

1. 启动 `firefly-device`。
2. 让设备上报一次事件。
3. 观察 `firefly-device` 日志，确认同一 `messageId` 不会重复消费刷屏。
4. 观察 Kafka，确认消息从 `device.event.report` 消费后转入 `rule.engine.input`，而不是再次写回 `device.event.report`。

## 4. 排查建议

- 如果仍有重复消费，优先区分是“消息被重新生产”还是“消费者组重复拉取”。
- 可按 `messageId` 搜索日志；若同一 `messageId` 反复出现且没有重平衡日志，通常是生产链路写回了原 topic。
- 若需要核对 topic 流向，请同时观察 `device.event.report` 与 `rule.engine.input`。
