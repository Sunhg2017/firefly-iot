# 设备 Kafka 消费落库修复运维说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 适用场景

用于排查以下现象：

- 设备已经通过 MQTT / HTTP / CoAP 正常上报属性，但设备数据页查不到最新遥测
- 设备触发了事件上报，但设备事件列表没有记录
- 影子能更新，但遥测历史和事件历史为空

## 2. 修复内容

- Kafka 消费属性上报后同步写入 `device_telemetry`
- Kafka 消费事件上报后同步写入 `device_events`
- 异步链路不再依赖请求线程中的租户上下文
- 上行消息路由日志收敛到 `DEBUG`，避免高频设备场景刷满 `INFO`
- 遥测 mapper XML 已补齐；`最新值 / 原始查询 / 聚合查询 / Kafka 遥测落库` 不再因 `Invalid bound statement` 失效

## 3. 验证步骤

```bash
cd firefly-device
mvn test "-Dtest=MessageRouterServiceTest"
```

联调验证建议：

1. 设备上报一次属性，例如 `temperature=26.5`
2. 确认影子 `reported.temperature` 更新
3. 再查询设备最新遥测，确认能看到同一属性
4. 设备上报一次事件
5. 查询设备事件列表，确认存在对应记录

## 4. 排查建议

- 如果影子更新了但遥测仍为空，优先检查 `telemetryMapper.batchInsert(...)` 是否执行成功
- 如果接口直接返回 `服务内部错误`，优先查看 `logs/firefly-device.log` 是否出现 `DeviceTelemetryMapper.* Invalid bound statement`
- 如果事件列表为空，优先检查事件 payload 是否至少带有可识别的类型字段；若没有，系统会以 `EVENT_REPORT` 作为兜底类型入库
- 若出现 `DEVICE_NOT_FOUND`，优先核对 Kafka 消息里的 `tenantId/deviceId` 是否与设备真实归属一致
