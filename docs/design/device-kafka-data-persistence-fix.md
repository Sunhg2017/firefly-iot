# 设备 Kafka 消费落库修复设计说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备属性和事件上报进入 Kafka 后，当前 `firefly-device` 只做了以下处理：

- 属性上报：更新设备影子，并转发规则引擎
- 事件上报：转发规则引擎

但设计文档约定的 `device_telemetry` / `device_events` 异步落库并没有真正发生，导致：

- 设备最新遥测、历史曲线可能看不到真实上报数据
- 设备事件列表无法反映通过协议接入层上报的真实事件
- 文档中的“Kafka 消费后落库”与实际实现不一致

## 2. 设计目标

- Kafka 消费到的属性上报必须写入 `device_telemetry`
- Kafka 消费到的事件上报必须写入 `device_events`
- 异步消费场景不依赖 `AppContextHolder`
- 保留原有影子更新与规则引擎转发链路

## 3. 修复方案

- `DeviceDataService` 新增：
  - `writeTelemetryFromMessage(DeviceMessage message)`
  - `writeEventFromMessage(DeviceMessage message)`
- Kafka 异步链路通过 `deviceId + tenantId` 做设备归属校验，使用 `DeviceMapper.selectByIdIgnoreTenant(...)`
- `MessageRouterService` 在处理：
  - `PROPERTY_REPORT` 时先落 telemetry，再更新影子，再转发规则引擎
  - `EVENT_REPORT` 时先落 event，再转发规则引擎
- 事件 payload 允许协议侧自由上报，服务端兼容提取 `eventType` / `type` / `name` / `level` 等常见字段，缺失时使用兜底值
- `DeviceTelemetryMapper.xml` 统一承接 `batchInsert / queryTelemetry / aggregateTelemetry / queryLatest`，避免 mapper 接口存在但 SQL 未落地时再次出现 `Invalid bound statement`

## 4. 影响范围

- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceDataService.java`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/MessageRouterService.java`
- `firefly-device/src/main/resources/mapper/device/DeviceTelemetryMapper.xml`
- `firefly-device/src/test/java/com/songhg/firefly/iot/device/service/MessageRouterServiceTest.java`
