# System/Support 启动 Flyway 策略设计

## 1. 背景

`firefly-system` 与 `firefly-support` 都在启动时执行 Flyway 迁移。当前开发环境数据库中已经存在历史迁移记录，但仓库内部分旧版本 SQL 曾被改写，导致 Flyway 在启动阶段对历史 checksum 校验失败，服务在 `flywayInitializer` 阶段直接中断。

本次实际观测到的失败现象：

- `firefly-system`：`V2`、`V6`、`V17` checksum mismatch
- `firefly-support`：`V2` checksum mismatch

## 2. 目标

1. 恢复 `firefly-system`、`firefly-support` 在 `dev` 环境的可启动性。
2. 不放松生产环境对历史迁移脚本的严格校验。
3. 给联调、运维和后续排障提供统一口径。

## 3. 范围

本次仅调整以下模块的启动配置：

- `firefly-system`
- `firefly-support`

不修改内容：

- 历史 Flyway 迁移脚本
- 数据库表结构
- 业务服务逻辑

## 4. 方案

### 4.1 开发环境默认关闭 `validate-on-migrate`

在两个模块的 `application.yml` 中增加：

```yml
spring:
  flyway:
    validate-on-migrate: ${FLYWAY_VALIDATE_ON_MIGRATE:false}
```

含义：

- `dev` 启动时默认不因历史 checksum 漂移而阻塞服务。
- 如需排查迁移脚本一致性，仍可通过环境变量显式打开严格校验。

### 4.2 生产环境保持严格校验

在两个模块的 `application-prod.yml` 中增加：

```yml
spring:
  flyway:
    validate-on-migrate: ${FLYWAY_VALIDATE_ON_MIGRATE:true}
```

含义：

- `prod` 默认仍严格校验历史迁移。
- 若生产环境出现 checksum mismatch，仍按正式 Flyway 修复流程处理，不允许静默跳过。

## 5. 设计取舍

### 5.1 为什么不直接修改旧 SQL 让 checksum 对回去

历史迁移已经在不同环境执行过，继续回改旧 SQL 风险很高，也无法保证所有环境都能重新与数据库历史记录完全一致。对当前任务来说，优先恢复开发环境可启动性更稳妥。

### 5.2 为什么不把所有环境都关闭校验

生产环境关闭校验会掩盖真正的迁移漂移问题，后续可能在新环境部署、数据库恢复或审计时放大风险。因此本次只放宽 `dev` 默认口径。

## 6. 风险与约束

1. 关闭 `dev` 默认校验并不代表 checksum 问题被“修复”，只是避免其阻塞本地启动。
2. 如果需要清理历史漂移，仍应通过 Flyway repair 或重新梳理迁移脚本解决。
3. 任何 `prod` 环境都不应依赖本次开发态放宽策略。
