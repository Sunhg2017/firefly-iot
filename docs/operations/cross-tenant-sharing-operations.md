# 跨租户共享运维说明

## 变更内容

本次跨租户共享收口包含以下数据库与服务变更：

- `firefly-rule`
  - 收紧共享策略与审计日志访问边界。
  - 新增外部共享只读接口：
    - `GET /api/v1/shared/devices`
    - `GET /api/v1/shared/devices/{deviceId}/properties`
    - `GET /api/v1/shared/devices/{deviceId}/telemetry`
- `firefly-device`
  - 新增内部共享设备与遥测只读接口：
    - `POST /api/v1/internal/devices/shared/resolve`
    - `GET /api/v1/internal/device-data/shared/{deviceId}/latest`
    - `POST /api/v1/internal/device-data/shared/query`
- `firefly-system`
  - 新增 Flyway：`V37__align_share_revoke_permission.sql`

## 发布步骤

1. 先发布 `firefly-api`。
2. 再发布 `firefly-device`。
3. 最后发布 `firefly-rule` 与 `firefly-system`。
4. 确认 `firefly-system` 已执行到 `V37__align_share_revoke_permission.sql`。

## 发布后核查

### 权限台账

执行以下 SQL，确认共享权限目录已对齐：

```sql
select permission_code, permission_label, permission_sort_order
from workspace_menu_permission_catalog
where workspace_scope = 'TENANT'
  and menu_key = 'share'
order by permission_sort_order;
```

预期包含：

- `share:create`
- `share:read`
- `share:update`
- `share:delete`
- `share:approve`
- `share:revoke`

### 权限资源

```sql
select code, name, type, path
from permission_resources
where code like 'share:%'
order by code;
```

### 审计数据

```sql
select action, count(1)
from share_audit_logs
group by action
order by action;
```

## 日志定位

### 规则服务

重点关注：

- 共享策略越权访问被拦截
- 共享策略配置非法被跳过
- Feign 调用设备服务失败

建议检索关键字：

- `共享策略不存在`
- `共享策略未授权`
- `Skip invalid shared policy`
- `解析共享设备失败`

### 设备服务

重点关注：

- owner tenant 与设备真实 tenant 不匹配
- 共享范围里的产品不属于 owner tenant

建议检索关键字：

- `Skip shared scope product outside owner tenant`

## 常见故障

### 1. 消费方查不到共享设备

排查顺序：

1. 确认策略状态为 `APPROVED`。
2. 确认 `scope` 至少包含一个有效的 `productKeys` 或 `deviceNames`。
3. 确认 `productKey` 属于 owner tenant。
4. 确认设备没有被逻辑删除。

### 2. 能看到设备但查属性/遥测报权限不足

检查 `dataPermissions`：

- 最新属性读取依赖 `properties=true` 或等价开启。
- 历史遥测读取依赖 `telemetry=true` 或 `telemetryHistory.enabled=true`。

### 3. 撤销按钮 403

确认：

- `firefly-system` 已执行 `V37__align_share_revoke_permission.sql`
- 当前角色已持有 `share:revoke`

## 数据清理建议

本次实现不再兼容旧的无效共享策略。若历史库中存在以下数据，请清理后重建：

- `scope` 为空
- `scope` 非法 JSON
- `scope` 中只包含当前运行时无法解析的旧字段
- `dataPermissions` 非法 JSON

## 回滚说明

若需要回滚：

1. 先回滚 `firefly-rule`、`firefly-device` 服务版本。
2. 保留 `V37` 数据迁移不回退，仅回滚业务代码。
3. 若必须回退权限台账，请在确认没有新角色依赖 `share:revoke` 后，手工清理：
   - `workspace_menu_permission_catalog`
   - `permission_resources`
   - `role_permissions`

默认不建议回滚权限数据，避免再次出现控制器权限与系统台账不一致。
