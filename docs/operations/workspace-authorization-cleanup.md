# 工作空间授权与菜单收口运维说明

## 1. 适用范围

本说明适用于以下变更后的运维与排查：

- 平台空间/租户空间用户与角色分治
- 租户空间功能授权收口到租户管理
- 旧菜单接口、旧默认权限配置下线
- 协议解析 `DEVICE_LIST` 发布策略收口为 `deviceNames`

## 2. 发布影响

受影响模块：

- `firefly-system`
- `firefly-device`
- `firefly-connector`
- `firefly-web`

本次不新增运行时外部依赖，但会改变以下行为：

- 租户侧不再存在菜单自维护接口。
- 系统设置页不再提供“租户管理员默认权限”配置。
- 登录和菜单渲染不再读取旧菜单配置兜底。
- 协议解析规则发布配置不再接受 `deviceIds`。

## 3. 发布步骤

1. 发布后端服务：
   - `firefly-system`
   - `firefly-device`
   - `firefly-connector`
2. 发布前端：
   - `firefly-web`
3. 发布完成后执行以下校验：

```bash
mvn -pl firefly-system,firefly-device -am -DskipTests clean compile
cd firefly-web
npm run build
```

## 4. 数据清理建议

系统未正式启用，建议直接清理旧数据，而不是保留兼容分支。

重点清理项：

```sql
delete from system_configs
where config_key = 'tenant.admin.default-permissions';

update protocol_parsers
set release_config_json = null
where release_config_json like '%"deviceIds"%';
```

如需重建租户空间授权，可由系统运维重新在“租户管理 -> 空间授权”中保存一次目标租户菜单。

如发现 `tenant_menu_configs` 中保留了不再授权的旧菜单，可按租户维度重新覆盖写入当前授权结果，而不是做增量修补。

## 5. 发布后验证

### 5.1 平台空间验证

- 平台管理员登录后可看到：
  - 租户管理
  - 用户管理
  - 角色管理
  - 权限资源
  - 系统设置
- 系统设置页不再出现“租户管理员默认权限”页签。

### 5.2 租户空间验证

- 租户管理员登录后可看到：
  - 用户管理
  - 角色管理
  - 已授权的业务菜单
- 不再存在“租户菜单配置”或同类自维护入口。

### 5.3 权限收敛验证

1. 在平台空间调整某租户的空间授权。
2. 重新打开该租户下角色详情。
3. 确认角色权限只剩当前可授权范围内的权限。
4. 使用租户用户重新登录，确认侧边栏与首页跳转与新授权保持一致。
5. 如需核对登录态，额外检查：
   - `/api/v1/users/me` 中 `authorizedMenuPaths` 不为空。
   - `/api/v1/users/me/permissions` 中存在对应菜单权限，而不是空集合。

### 5.4 协议解析验证

1. 打开协议解析规则页面。
2. 新建或编辑 `DEVICE_LIST` 发布策略。
3. 确认页面只维护 `deviceNames`。
4. 保存后检查规则详情 JSON 中不再出现 `deviceIds`。

## 6. 常见问题

### 6.1 租户管理员登录后看不到用户管理

按顺序检查：

1. 该租户是否已被平台授权 `/user` 对应模块。
2. 当前租户管理员角色是否仍保留 `user:read`。
3. 用户是否重新登录以刷新权限缓存。

### 6.2 租户角色权限比授权范围多

重点检查：

1. 租户空间授权变更后是否执行了角色权限同步。
2. 是否存在历史脏数据直接插入 `role_permissions`。
3. 当前用户权限缓存是否已清理。

### 6.3 租户超级管理员登录直接进入 403，但 authorizedMenuPaths 已有值

重点检查：

1. `/api/v1/users/me/permissions` 是否为空。
2. 目标租户的超级管理员角色在 `role_permissions` 中是否实际存在权限记录。
3. 平台侧保存“空间授权”时，后端是否已经带着目标租户上下文执行角色权限同步，而不是仍使用系统运维租户上下文。

处置方式：

1. 发布包含“目标租户上下文切换”修复的 `firefly-system` 版本。
2. 对受影响租户重新同步角色权限，再让租户管理员重新登录验证。
3. 如果只是前端缓存旧登录态，刷新页面或重新登录即可重新拉取权限。

### 6.4 协议解析保存时报发布配置非法

重点检查：

1. `releaseConfigJson` 是否仍包含 `deviceIds`。
2. `DEVICE_LIST` 是否改为维护 `deviceNames`。
3. 是否由旧脚本或旧接口继续提交历史 JSON 模板。

## 7. 回滚说明

本次建议不要回滚到旧菜单与旧权限模型。

如果必须回滚代码版本：

- 先确认不会重新启用已删除接口。
- 清楚告知使用方旧页面与旧数据可能不再匹配。
- 优先使用数据库清理和重新授权恢复一致性，而不是在新版本代码里补兼容判断。
