# 设备管理运维说明
> 版本: v1.0.1
> 日期: 2026-03-14

## 1. 适用范围

本文用于设备管理模块的日常运维、问题排查与回滚，重点覆盖设备删除、列表查询与逻辑删除一致性。

## 2. 删除机制

- 设备管理使用逻辑删除，数据库字段为 `devices.deleted_at`
- 服务端删除必须通过 `DeviceService.deleteDevice(...)`
- 实际落库删除动作必须走 MyBatis-Plus `deleteById(...)`，由 `@TableLogic` 统一生成逻辑删除 SQL

## 3. 常见问题排查

### 3.1 删除设备后列表仍然存在

按以下顺序排查：

1. 确认调用的是 `DELETE /api/v1/devices/{id}`
2. 确认服务端日志是否打印 `Device deleted`
3. 检查数据库中 `devices.deleted_at` 是否已写入
4. 确认当前服务版本已包含“删除走 `deleteById`”修复
5. 重新调用 `/api/v1/devices/list`，确认返回结果是否已过滤该设备

## 4. 回归验证

执行以下验证：

1. 新建设备
2. 在设备管理页删除该设备
3. 刷新设备列表，确认设备不再出现
4. 数据库确认 `deleted_at` 非空
5. 产品 `device_count` 已同步减一

## 5. 回滚说明

若本次修复需要回滚，需同时回滚：

- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java`
- `docs/design/detailed-design-device-management.md`
- `docs/operations/device-management-operations.md`
- `docs/user-guide/device-management-guide.md`
