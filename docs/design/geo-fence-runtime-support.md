# 地理围栏运行时支持设计

## 1. 背景

现有地理围栏模块此前只完成了三部分：

1. 围栏 CRUD
2. 手工位置上报接口
3. 单次“是否在围栏内”的检测接口

但没有进入设备主消息链路，也没有把围栏进出结果沉淀成设备事件，因此页面虽然能配置围栏，业务运行时基本没有自动服务支撑。

## 2. 目标与范围

### 2.1 目标

1. 设备属性上报中出现经纬度时，自动落设备位置历史
2. 围栏只在“状态变化”时触发进入/离开事件，避免每次上报都重复噪声
3. 围栏触发结果沉淀为设备事件，并同步进入规则引擎输入流
4. 设备位置查询和围栏读取补齐租户隔离

### 2.2 范围

- `firefly-device` 围栏运行时
- `device_locations` 表租户化
- 围栏事件生成与规则引擎接入

## 3. 总体方案

### 3.1 位置自动提取

在 `MessageRouterService` 的属性上报分支中，属性载荷规范化后继续提取位置字段：

1. 经度：`longitude` 或 `lng`
2. 纬度：`latitude` 或 `lat`
3. 其他附加字段：`altitude`、`speed`、`heading`

只要经纬度存在且坐标范围合法，就自动进入 `DeviceLocationService.syncLocationFromPropertyReport(...)`。

### 3.2 位置落库

`device_locations` 现在补齐 `tenant_id`，位置记录保存时写入：

1. `tenant_id`
2. `device_id`
3. `lng`
4. `lat`
5. `altitude`
6. `speed`
7. `heading`
8. `source`
9. `reported_at`

这样设备位置历史可以按租户和设备双维度隔离查询。

### 3.3 围栏状态机

围栏不再按“当前是否在围栏内”直接打日志，而是按“上一位置状态 -> 当前位置状态”的变化判定：

1. 上次不在、这次在：`ENTER`
2. 上次在、这次不在：`LEAVE`
3. 其他情况：不触发事件

如果设备没有上一条位置记录，则只记当前位置，不触发进入/离开事件。这样可以避免设备第一次上线时因为缺少历史状态而误判。

### 3.4 触发类型

围栏的 `triggerType` 继续沿用现有枚举：

1. `ENTER`
2. `LEAVE`
3. `BOTH`

围栏运行时只在状态变化且匹配 `triggerType` 时发出事件。

## 4. 事件模型

围栏变化会生成一条合成设备事件：

- `eventType = geofenceAlarm`
- `eventName = 围栏进入` 或 `围栏离开`
- `eventLevel = WARNING`

事件 payload 统一包含：

1. `fenceId`
2. `fenceName`
3. `transition`
4. `transitionCode`
5. `transitionLabel`
6. `longitude`
7. `latitude`
8. `timestamp`

其中 `transition` 沿用 GPS 模板的枚举口径：

1. `0` 表示进入
2. `1` 表示离开

## 5. 规则引擎接入

围栏事件除了写入 `device_events`，还会构造成内部 `EVENT_REPORT` 消息投递到 `KafkaTopics.RULE_ENGINE_INPUT`。

这样后续能力可以直接复用已有链路：

1. 规则引擎动作
2. 通知中心
3. 后续基于事件的自动化编排

当前告警运行时仍只消费属性上报，因此围栏事件不会直接走当前的告警规则模块，这一限制保持不变。

## 6. 租户隔离设计

### 6.1 围栏

`GeoFenceService.getFence/update/delete/toggle` 改为按 `tenant_id + id` 查询，不再裸用 `selectById`。

### 6.2 位置

`getLatestLocation/getLocationHistory/getTrack` 在查询前先校验设备归属，再按：

1. `tenant_id`
2. `device_id`

联合查询位置数据。

## 7. 数据库设计

新增迁移：

- `firefly-device/src/main/resources/db/migration/V26__activate_geo_fence_runtime.sql`

内容：

1. 为 `device_locations` 新增 `tenant_id`
2. 用 `devices.tenant_id` 回填历史位置记录
3. 增加 `(tenant_id, device_id, reported_at desc)` 索引

## 8. 设计取舍

### 8.1 为什么不用独立围栏状态表

当前围栏进出判断只需要“上一条位置”和“当前条位置”，直接基于位置历史即可完成状态迁移判断，不需要额外引入状态表。

### 8.2 为什么生成设备事件而不是直接发告警

围栏本质上是设备运行事件。先把它沉淀为标准事件，再由规则引擎或后续编排去消费，边界更清晰，也能复用现有事件查询能力。

### 8.3 为什么第一次位置不上报围栏变化

因为没有可比较的上一状态。若第一次就触发“进入”或“离开”，会把初始位置误当成状态变化。

## 9. 风险与清理要求

1. 历史 `device_locations` 若存在孤儿设备记录，`tenant_id` 可能无法回填，需要运维清理。
2. 当前围栏仍按“租户内所有启用围栏对所有带定位上报的设备生效”处理，未新增设备/产品级作用域配置。
3. 设备如果上报的不是 `longitude/latitude` 或 `lng/lat`，不会自动进入围栏运行时，需要先统一属性命名。
