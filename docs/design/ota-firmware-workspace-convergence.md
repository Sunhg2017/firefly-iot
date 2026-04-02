# OTA 与固件工作台收口设计

## 目标

- 取消重复的 `/firmware` 页面，统一收口到 `/ota`
- 把固件库、设备版本、升级任务放进同一工作台
- 把“手填文件 URL / 大小 / MD5”和“手填绑定版本号”改成系统自动生成
- 删除旧 `firmware:*` 权限口径，统一回 `ota:*`

## 根因

- 前端同时存在 `固件管理` 与 `OTA 升级` 两个入口，用户需要来回切页
- `/firmware` 页面的状态枚举与后端 `DRAFT / VERIFIED / RELEASED` 不一致
- 上传固件并不是真上传，而是要求用户手工填写文件元数据
- 设备固件绑定接口允许前端手填 `version`，会造成 `firmwareId` 与版本号不一致

## 方案

### 1. 单入口工作台

- 租户空间只保留 `/ota`
- 菜单名称统一为 `OTA 与固件`
- 页面内拆成 3 个页签：
  - `固件库`
  - `设备版本`
  - `升级任务`

### 2. 固件库

- 上传固件改成抽屉提交
- 用户只需要选择产品、填写版本号、可选名称/描述、选择文件
- 文件在提交时才调用 `/api/v1/files/upload/firmware`
- 后端返回 `url / fileSize / md5Checksum`，前端不再让用户手填元数据

### 3. 设备版本

- 新增 `/api/v1/device-firmwares/list`
- 查询口径从“按固件看已绑定设备”扩展为“所有设备 + 当前版本登记”
- 后端通过 `devices LEFT JOIN latest device_firmwares` 返回设备总览
- `products` 关联只按 `p.id = d.product_id` 连接，不再追加不存在的 `p.deleted_at` 条件；当前产品表没有逻辑删除列
- 绑定时只传 `firmwareId`
- 服务端根据固件记录自动回填 `currentVersion`
- 服务端校验设备与固件必须属于同一产品

### 4. 升级任务

- 任务创建抽屉只选择目标固件，不再手填 `destVersion`
- `destVersion` 由前端根据所选固件自动带出
- 灰度比例只在灰度任务时展示

### 5. 菜单与权限

- 新增 Flyway `V36__converge_firmware_menu_into_ota.sql`
- 删除 `workspace_menu_catalog / workspace_menu_permission_catalog` 中的 `firmware`
- 删除租户菜单个性化和租户授权中的旧 `firmware` 记录
- 迁移 `role_permissions`：
  - `firmware:read` / `firmware:update` -> `ota:read`
  - `firmware:update` -> `ota:upload`
- 删除旧 `firmware:*` 权限资源

## 接口变化

| 接口 | 变化 |
|------|------|
| `POST /api/v1/files/upload/firmware` | 现在返回 `md5Checksum` |
| `POST /api/v1/device-firmwares/list` | 新增，支持设备版本总览 |
| `POST /api/v1/device-firmwares/bind` | 删除手填 `version`，仅保留 `deviceId + firmwareId` |
| `POST /api/v1/device-firmwares/batch-bind` | 删除手填 `version`，仅保留 `deviceIds + firmwareId` |

## 风险与取舍

- 本次直接删除 `/firmware`，不保留兼容路由
- 历史角色上的 `firmware:*` 会通过迁移一次性折叠到 `ota:*`
- 如果历史环境里存在设备与固件跨产品绑定脏数据，新代码不会继续允许新增这类数据
