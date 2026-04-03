# 地理围栏运行时运维说明

## 1. 变更内容

本次发布后，地理围栏不再只是静态配置页面，而是进入设备运行链路：

1. 设备属性上报带经纬度时自动落位置历史
2. 围栏按位置状态变化判定进入/离开
3. 围栏变化自动写入设备事件
4. 围栏变化同步投递到规则引擎输入流

## 2. 影响模块

1. `firefly-device`
2. 依赖规则引擎消费的下游服务

## 3. 数据库变更

新增迁移：

- `firefly-device/src/main/resources/db/migration/V26__activate_geo_fence_runtime.sql`

变更内容：

1. `device_locations` 增加 `tenant_id`
2. 历史位置按设备回填租户
3. 新增租户设备联合索引

### 3.1 发布后检查

```sql
select column_name
from information_schema.columns
where table_name = 'device_locations'
  and column_name = 'tenant_id';

select indexname
from pg_indexes
where tablename = 'device_locations'
  and indexname = 'idx_device_locations_tenant_device';
```

## 4. 发布前检查

### 4.1 设备属性命名

自动位置提取依赖以下字段：

1. `longitude` / `latitude`
2. 或 `lng` / `lat`

如果设备使用其它命名，需要先统一协议解析结果或物模型属性映射。

### 4.2 历史脏数据

如果 `device_locations` 中存在无法关联到 `devices.id` 的孤儿记录，需要先清理，否则这些旧记录不会被正确回填 `tenant_id`。

## 5. 发布步骤

1. 执行 `firefly-device` 的 Flyway 迁移
2. 发布 `firefly-device`
3. 用带定位属性上报的设备做联调

## 6. 验证项

### 6.1 自动化验证

```bash
mvn -pl firefly-device -am test
```

### 6.2 功能验证

建议按以下顺序验证：

1. 新建一个启用中的围栏
2. 让设备连续上报两次定位，一次在围栏外，一次在围栏内
3. 确认 `device_locations` 新增位置记录
4. 确认 `device_events` 新增 `geofenceAlarm` 事件
5. 确认日志中出现围栏进入或离开记录
6. 若配置了事件规则，确认规则引擎能收到对应事件

## 7. 日志定位

关键日志关键词：

1. `GeoFence transition triggered`
2. `Failed to sync device location for property report`
3. `GeoFence check failed`

排查顺序：

1. 先看设备属性上报是否已进入 `PROPERTY_REPORT`
2. 再看是否成功提取经纬度
3. 再看围栏状态变化是否成立
4. 最后看事件写入和规则引擎投递

## 8. 常见问题

### 8.1 围栏有配置，但一直没有触发

优先检查：

1. 设备是否真的上报了 `longitude/latitude` 或 `lng/lat`
2. 经纬度值是否在合法范围内
3. 围栏是否启用
4. 设备是否至少有两次位置上报

### 8.2 第一次定位上报没有围栏事件

这是预期行为。系统需要上一条位置作为基线，第一次只记录位置，不判断进入/离开。

### 8.3 围栏事件写进了设备事件，但没有告警

这是当前架构限制。围栏变化现在会生成设备事件并进入规则引擎，但不会直接进入当前只消费属性上报的告警运行时。

### 8.4 位置查询看不到历史

排查：

1. 设备是否属于当前租户
2. 位置记录是否已写入 `device_locations`
3. `tenant_id` 是否回填成功

## 9. 回滚说明

如需回滚：

1. 可先回滚 `firefly-device` 应用版本
2. `V26__activate_geo_fence_runtime.sql` 新增列和索引可以保留

注意：

如果回滚到旧版本，`device_locations.tenant_id` 会暂时无人使用，但不会影响旧表读取。
