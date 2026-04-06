# 租户套餐与配额能力下线设计说明

> 模块: firefly-system / firefly-web / firefly-common
> 日期: 2026-04-06
> 状态: Done

## 1. 背景

租户套餐、租户配额相关页面、接口和数据结构已经存在，但当前版本没有形成可稳定落地的业务闭环，继续保留只会增加误操作和维护成本。

仓库当前规则要求系统未正式使用时直接收口到最佳实现，不为旧能力保留双轨兼容，因此本次直接删除套餐、配额相关实现，而不是继续隐藏入口或保留备用接口。

## 2. 目标

- 删除租户套餐、配额相关前后端接口、页面入口和数据模型。
- 删除 `tenants.plan` 字段与 `tenant_quotas` 表，避免后续继续被误用。
- 清理租户管理权限台账中的 `tenant:quota`、`tenant:billing` 残留。
- 保留当前仍可用的租户生命周期、隔离级别、用量统计、空间授权、OpenAPI 订阅、Webhook 与超管密码重置能力。

## 3. 方案

### 3.1 后端收口

- 删除平台侧租户套餐/配额接口：
  - `PUT /api/v1/platform/tenants/{id}/plan`
  - `GET /api/v1/platform/tenants/{id}/quota`
  - `PUT /api/v1/platform/tenants/{id}/quota`
- 删除租户自助接口：
  - `GET /api/v1/tenant/quota`
- `TenantService` 不再创建默认套餐、不再生成租户配额记录、不再提供套餐切换和配额读写逻辑。
- `AppContext` 不再携带租户套餐信息，Kafka 上下文复制同步删除对应字段。

### 3.2 前端收口

- 租户管理页删除：
  - 套餐筛选
  - 套餐概览卡片
  - 套餐列
  - “调整套餐”“调整配额”入口
  - 新建租户时的套餐选择
- 前端 API 封装删除套餐/配额类型、参数校验和调用方法。
- 前端烟雾脚本删除 `/SYSTEM/api/v1/tenant/quota` 校验项。

### 3.3 数据与权限收口

- 新增 Flyway `V38__remove_tenant_plan_and_quota.sql`：
  - 删除 `idx_tenants_plan`
  - 删除 `tenants.plan`
  - 删除 `tenant_quotas`
  - 将 `permission_groups` 中 `TENANT` 分组权限收口为 `tenant:read`、`tenant:manage`

## 4. 影响范围

- `firefly-system` 租户控制器、服务、DTO、实体、测试
- `firefly-common` 上下文、认证常量、租户事件
- `firefly-web` 租户管理页面、API 封装
- `scripts/frontend-api-smoke.ps1`
- 租户管理、权限与工作空间相关文档

## 5. 风险与取舍

- 历史环境执行迁移后，旧脚本或旧前端若继续调用套餐/配额接口会直接失败，需要同步发布前后端。
- 本次不保留旧数据兼容；如数据库中还存在依赖 `tenant_quotas` 的人工脚本或报表，需要运维先完成下线清理。
- 设备、OTA、OpenAPI 等资源治理后续若需要重新引入统一配额能力，应基于新的可执行方案重新设计，不复用本次删除的旧模型。
