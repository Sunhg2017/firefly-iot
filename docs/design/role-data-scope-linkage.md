# 角色数据范围联动设计

## 1. 背景

此前角色管理里的 `PROJECT`、`GROUP`、`CUSTOM` 数据范围只有一个枚举值，没有形成真正的配置联动：

- 角色页不会根据数据范围展示项目或设备分组选择。
- `@DataScope` 解析器只在系统服务内生效，设备、规则、媒体等服务默认没有解析器实现，导致大部分业务页实际上没有被数据范围限制。
- `GROUP` 范围缺少和当前业务资源的有效映射，选择后只是存了一段配置。

这次改造直接收口为一套可执行模型，不再保留“只存配置、不参与过滤”的空壳能力。

## 2. 目标与范围

### 2.1 目标

- 角色创建/编辑时，数据范围必须和项目、设备分组选项联动。
- 数据范围解析器下沉到公共模块，让 `system / device / rule / media` 四类服务统一生效。
- 项目、产品、设备三类资源统一作为数据范围的收口维度，覆盖项目、产品、设备、告警、规则、OTA、视频等主要业务页面。
- 对空范围角色在保存阶段直接拦截，避免继续生成可登录但无确定访问边界的角色。

### 2.2 范围

- 前端：角色管理页数据范围联动表单。
- 后端：公共数据范围解析器、MyBatis 数据范围注解扩展、各业务服务 `@DataScope` 标注收口。
- 不做数据库结构变更。

## 3. 方案

## 3.1 角色配置模型

- `ALL`
  - 不配置 `dataScopeConfig`
  - 可访问当前租户全部数据
- `SELF`
  - 不配置 `dataScopeConfig`
  - 仅按 `created_by` 过滤
- `PROJECT`
  - 角色页必须选择至少一个项目
  - 保存到 `roles.data_scope_config.projectIds`
- `GROUP`
  - 角色页必须选择至少一个设备分组
  - 保存到 `roles.data_scope_config.groupIds`
- `CUSTOM`
  - 角色页可同时选择项目和设备分组
  - 至少选择一个项目或设备分组

旧的 `user_roles.project_id` 方案不再作为数据范围解析来源；如库里存在历史值，需按当前角色配置口径清理。

## 3.2 统一解析器

公共模块新增 `DatabaseDataScopeResolver`，由所有业务服务复用：

1. 读取当前用户的 `user_roles` 与 `roles`
2. 若存在 `ALL` 角色，则直接返回全量访问
3. 从角色配置中提取：
   - `projectIds`
   - `groupIds`
4. 根据项目与分组反推：
   - `projectIds`
   - `productIds`
   - `deviceIds`
5. 将结果写入 `DataScopeContext`

这样设备服务、规则服务、媒体服务不再依赖系统服务内的专有解析器。

## 3.3 资源收口规则

- 项目型资源：按 `projectIds`
  - `projects`
  - `rules`
  - `alarm_rules`
  - `alarm_records`
- 产品型资源：按 `productIds`
  - `products`
  - `firmwares`
  - `ota_tasks`
- 设备型资源：按 `deviceIds`
  - `devices`
  - `video_devices`

`GROUP` 与 `CUSTOM` 选择设备分组后，会先反查分组成员设备，再推导出对应项目与产品集合。

## 3.4 注解扩展

`@DataScope` 新增：

- `productColumn`
- `deviceColumn`

MyBatis 拦截器会按当前实体实际存在的列拼接 `OR` 条件，不再假定所有表都只有 `project_id`。

示例：

- 项目列表：`@DataScope(projectColumn = "id", productColumn = "", deviceColumn = "", groupColumn = "")`
- 设备列表：`@DataScope(projectColumn = "project_id", productColumn = "", deviceColumn = "id", groupColumn = "")`
- 视频设备列表：`@DataScope(projectColumn = "", productColumn = "", deviceColumn = "device_id", groupColumn = "")`

## 3.5 前端交互

角色管理页在“基本信息”步骤直接联动：

- 选择 `PROJECT` 时展示项目多选
- 选择 `GROUP` 时展示设备分组范围多选
- 选择 `CUSTOM` 时同时展示项目多选与设备分组范围多选
- 选择 `ALL / SELF` 时清空范围配置

保存前前后端双重校验：

- `PROJECT` 至少 1 个项目
- `GROUP` 至少 1 个设备分组
- `CUSTOM` 至少 1 个项目或设备分组

## 4. 影响范围

- `firefly-common`
  - 新增公共数据范围解析实体、Mapper、Resolver
  - 扩展 `DataScopeContext / DataScope / DataScopeInterceptor / DataScopeAspect`
- `firefly-system`
  - 删除旧的 `SystemDataScopeResolver`
  - 角色服务增加数据范围配置校验
  - 项目列表按项目主键做范围过滤
- `firefly-device`
  - 设备、产品、固件、OTA 列表统一接入公共数据范围解析
- `firefly-rule`
  - 规则、告警规则、告警记录统一接入公共数据范围解析
- `firefly-media`
  - 视频设备列表按底层设备范围过滤
- `firefly-web`
- 角色管理页增加项目 / 设备分组联动表单

## 5. 风险与取舍

- 旧的 `user_roles.project_id` 历史数据不会再驱动数据范围，需要运维清理并改为角色级配置。
- 角色管理员如果没有项目读取或设备分组读取权限，将无法从前端加载候选项；当前默认由具备角色管理能力的管理员承担该配置职责。
- 本次不保留旧双轨逻辑，避免后续再出现“同一个角色同时被两套口径解释”的问题。
