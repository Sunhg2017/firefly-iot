# 审计日志接口可用性修复设计

## 1. 背景

系统运维空间已经提供了 `审计日志` 菜单和页面，前端也会固定请求 `/api/v1/audit-logs/list`。但 `firefly-system` 中审计日志的 Controller、Service、AOP 记录器都被 `firefly.audit.enabled` 条件开关包住，而默认配置把该开关设成了 `false`。

这会导致：

- 页面菜单可见、路由可进入
- 前端请求正常发出
- 后端却根本没有注册审计日志接口
- 页面最终统一提示“加载审计日志失败”

根因不是前端查询参数错误，而是后端把正式功能整体关掉了。

## 2. 目标

- 恢复审计日志接口和记录链路的默认可用性
- 删除导致功能失效的旧条件开关，避免再次出现“页面存在、接口不存在”的割裂状态
- 保持现有菜单、权限和数据库结构不变

## 3. 范围

涉及文件：

- `firefly-system/src/main/java/com/songhg/firefly/iot/system/controller/AuditLogController.java`
- `firefly-system/src/main/java/com/songhg/firefly/iot/system/service/AuditLogService.java`
- `firefly-system/src/main/java/com/songhg/firefly/iot/system/aspect/AuditLogAspect.java`
- `firefly-system/src/main/resources/application.yml`

不涉及：

- 菜单台账和权限点变更
- 审计日志表结构变更
- 前端页面字段和查询交互改造

## 4. 方案

### 4.1 删除审计功能条件开关

- 去掉 `AuditLogController` 上的 `@ConditionalOnProperty`
- 去掉 `AuditLogService` 上的 `@ConditionalOnProperty`
- 去掉 `AuditLogAspect` 上的 `@ConditionalOnProperty`

这样系统启动后会稳定注册：

- 审计日志查询接口
- 审计日志详情接口
- `@Auditable` 对应的审计记录能力

### 4.2 移除默认配置里的无效关闭项

- 从 `firefly-system/src/main/resources/application.yml` 删除 `firefly.audit.enabled: false`

因为当前产品已经显式提供审计日志菜单、权限和数据表，继续保留默认关闭开关只会制造不可用状态，不符合当前实现收口原则。

## 5. 关键取舍

- 没有改成“配置默认 true 但仍保留开关”，而是直接删除旧开关。当前系统并不存在继续关闭审计能力的合理交付场景。
- 没有调整前端请求逻辑，因为根因证据明确在后端 Bean 未注册，而不是前端链路错误。

## 6. 风险与边界

- 启用后，带 `@Auditable` 的操作会继续写入 `audit_logs`，数据库需要保持现有 Flyway 迁移后的表结构完整。
- 本次只修复“加载失败”的可用性问题，不额外扩展审计日志筛选、导出或详情权限模型。
