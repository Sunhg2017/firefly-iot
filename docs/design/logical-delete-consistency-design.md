# 逻辑删除一致性设计说明
> 版本: v1.0.0
> 日期: 2026-03-14

## 1. 背景

项目内部分实体使用 MyBatis-Plus `@TableLogic` 管理 `deleted_at` 逻辑删除字段，但个别服务删除实现仍采用手工 `setDeletedAt(...)+updateById(...)`。

这种写法虽然看起来也会写入删除时间，但会让删除路径和框架内置逻辑删除 SQL 分叉，增加“删除成功但查询口径不一致”的风险。

## 2. 统一规则

- 只要实体声明了 `@TableLogic`，删除动作必须通过 `deleteById(...)` 或 `delete(wrapper)` 触发。
- 如删除前还需要写业务状态，应先 `updateById(...)` 更新状态，再执行逻辑删除。
- 查询侧继续统一按逻辑删除字段过滤，不再依赖各服务手工维护。

## 3. 本次审查覆盖

- `firefly-device` 设备
- `firefly-device` 设备定位器
- `firefly-system` API Key
- `firefly-system` 租户
- `firefly-system` 用户

## 4. 设计取舍

- 保留“删除前先更新状态”的业务语义，例如用户删除前标记为禁用、租户删除前标记为停用中。
- 删除落库统一交给 MyBatis-Plus 逻辑删除，避免各模块自行拼接 `deleted_at` 更新行为。
