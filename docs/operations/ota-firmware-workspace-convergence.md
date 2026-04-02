# OTA 与固件工作台收口运维说明

## 发布内容

- 前端删除 `/firmware` 页面，统一到 `/ota`
- 后端新增设备版本总览接口 `/api/v1/device-firmwares/list`
- 固件上传接口 `/api/v1/files/upload/firmware` 增加 `md5Checksum`
- Flyway 新增 `V36__converge_firmware_menu_into_ota.sql`

## 部署步骤

1. 发布 `firefly-device`
2. 发布 `firefly-support`
3. 发布 `firefly-web`
4. 发布 `firefly-system` 并执行 Flyway

## 迁移检查

### 菜单台账

```sql
select workspace_scope, menu_key, label, route_path
from workspace_menu_catalog
where workspace_scope = 'TENANT'
  and menu_key in ('firmware', 'ota');
```

预期：

- 不再有 `firmware`
- `ota` 的 `label = 'OTA 与固件'`
- `route_path = '/ota'`

### 权限台账

```sql
select workspace_scope, menu_key, permission_code, permission_label
from workspace_menu_permission_catalog
where workspace_scope = 'TENANT'
  and menu_key = 'ota'
order by permission_sort_order;
```

预期只保留：

- `ota:read`
- `ota:upload`
- `ota:deploy`
- `ota:delete`

### 角色权限迁移

```sql
select permission, count(1)
from role_permissions
where permission like 'firmware:%'
   or permission like 'ota:%'
group by permission
order by permission;
```

预期：

- 不再存在 `firmware:read`、`firmware:update`
- 原有角色已经补齐对应 `ota:*`

## 功能验收

### 固件上传

- 进入 `/ota`
- 在 `固件库` 上传一个测试文件
- 确认接口返回包含 `md5Checksum`
- 列表里能看到文件大小与 MD5

### 设备版本

- 进入 `设备版本`
- 确认未登记过版本的设备也能查到
- 选择同一产品下多台设备执行批量登记
- 若故意选择跨产品设备，前端会阻止提交，后端也会校验

### 升级任务

- 在 `升级任务` 新建任务
- 选择目标固件后，`目标版本` 自动带出
- 不再需要手填 `destVersion`

## 常见故障

### 仍然看到旧菜单 `固件管理`

- 先确认 `V36` 是否执行
- 再检查是否有前端静态资源缓存未刷新

### 上传后没有 MD5

- 确认发布的是本次更新后的 `firefly-support`
- 检查 `/api/v1/files/upload/firmware` 返回体是否包含 `md5Checksum`

### 设备版本页为空

- 先确认设备资产本身存在
- 再确认 `firefly-device` 已发布到包含 `/api/v1/device-firmwares/list` 的版本

### 设备版本页报 `column p.deleted_at does not exist`

- 根因是 `/api/v1/device-firmwares/list` 的联表 SQL 误把 `products` 当成带逻辑删除列的表，追加了不存在的 `p.deleted_at`
- 当前产品表只有 `tenant_id / project_id / product_key / status` 等字段，没有 `deleted_at`
- 发布包含本次修复的 `firefly-device` 后重试

## 回滚

- 回滚代码时，需要同时回滚前后端与系统模块
- 如果必须恢复旧菜单，需要人工补回 `firmware` 对应菜单台账和权限台账
- 生产回滚前建议优先使用数据库备份恢复，而不是手工反向拼装旧菜单数据
