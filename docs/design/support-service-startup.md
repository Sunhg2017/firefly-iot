# Support 服务启动设计说明

## 1. 背景

`firefly-support` 在启动阶段依赖 Flyway 自动迁移数据库。现网代码中存在两个版本号同为 `V5` 的迁移脚本：

- `V5__async_task_refactor.sql`
- `V5__init_scheduled_tasks.sql`

Flyway 会在应用上下文初始化阶段校验迁移版本唯一性，因此服务会在 `flywayInitializer` 阶段直接失败，后续 Mapper、Service、Controller 都无法完成装配。

## 2. 目标

- 保证 `firefly-support` 的 Flyway 迁移版本连续且唯一。
- 修复定时任务初始化脚本中的 SQL 可执行性问题。
- 保持异步任务中心和定时任务表结构初始化顺序清晰可追溯。

## 3. 范围

本次设计仅覆盖 `firefly-support` 的数据库启动迁移：

- `V5__async_task_refactor.sql`
- `V6__init_scheduled_tasks.sql`

不调整业务服务逻辑、控制器接口和 MinIO/通知中心行为。

## 4. 方案

### 4.1 迁移版本去冲突

将原 `V5__init_scheduled_tasks.sql` 调整为 `V6__init_scheduled_tasks.sql`，让迁移链路变为：

1. `V4__init_async_tasks.sql`
2. `V5__async_task_refactor.sql`
3. `V6__init_scheduled_tasks.sql`

这样 Flyway 在扫描 `classpath:db/migration` 时不会再命中重复版本。

### 4.2 重写定时任务初始化脚本

原脚本中有一处注释与 `CREATE TABLE scheduled_task_logs` 粘连在同一行，属于高风险 SQL 书写错误。新版脚本直接重写为明确的 ASCII SQL：

- `scheduled_tasks`
- `scheduled_task_logs`
- 对应索引
- 对应字段注释

## 5. 风险与兼容性

- 如果某环境已经手工创建过 `scheduled_tasks` / `scheduled_task_logs`，本次脚本仍使用 `CREATE TABLE IF NOT EXISTS`，不会重复建表。
- 由于原 `V5__init_scheduled_tasks.sql` 在 Flyway 校验阶段就会被拦住，正常情况下不会存在“旧 V5 已应用、新 V6 也要重复执行”的情况。

## 6. 验证

验证方式：

```bash
cd firefly-support
mvn spring-boot:run
```

预期结果：

- Flyway 不再报 `Found more than one migration with version 5`
- Spring 容器可继续完成后续 Bean 初始化
