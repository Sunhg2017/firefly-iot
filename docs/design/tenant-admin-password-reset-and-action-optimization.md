# 租户超管密码重置与列表操作优化设计说明
> 模块: firefly-web / firefly-system / 租户管理
> 日期: 2026-03-17
> 状态: Done

## 1. 背景

租户管理列表已经承载编辑、套餐、配额、空间授权、Webhook、状态切换、注销等多类操作，行内按钮过多，阅读和点击成本都偏高。与此同时，平台管理员缺少对租户超级管理员账号的直接找回入口，遇到密码遗失时只能依赖人工处理。

## 2. 目标

- 在租户管理列表增加“重置超级管理员密码”能力。
- 保持与用户管理一致的密码重置体验：随机密码、一次性展示、支持复制。
- 收敛租户列表行内操作，把高频核心操作保留在主视图，低频操作折叠到“更多”菜单。

## 3. 方案

### 3.1 后端

- 新增接口 `POST /api/v1/platform/tenants/{id}/admin-password/reset`。
- 请求体使用 `TenantAdminPasswordResetDTO`，仅接收 `newPassword`。
- 服务层通过租户的 `adminUserId` 定位超级管理员账号并重置密码。
- 重置时同步更新：
  - `passwordHash`
  - `passwordChangedAt`
  - `loginFailCount`
  - `lockUntil`

### 3.2 前端

- 抽取公共随机密码生成工具 `firefly-web/src/utils/password.ts`，供用户管理与租户管理复用。
- 在租户列表“更多”菜单中新增“重置超管密码”。
- 点击后先做二次确认，再生成随机密码、调用接口并弹窗展示结果。
- 展示弹窗支持复制密码，并明确提示“只展示一次”。

### 3.3 列表操作优化

- 行内核心操作保留：
  - `用量`
  - `编辑`
  - `启用/暂停`
- 折叠到“更多”菜单的非核心操作：
  - `调整套餐`
  - `调整配额`
  - `重置超管密码`
  - `空间授权`
  - `Webhook`
  - `注销租户`

## 4. 影响范围

- `firefly-system/src/main/java/com/songhg/firefly.iot.system.controller/TenantController.java`
- `firefly-system/src/main/java/com/songhg/firefly.iot.system.service/TenantService.java`
- `firefly-system/src/main/java/com/songhg.firefly.iot.system.dto.tenant/TenantAdminPasswordResetDTO.java`
- `firefly-web/src/pages/tenant/TenantList.tsx`
- `firefly-web/src/services/api.ts`
- `firefly-web/src/utils/password.ts`

## 5. 风险与约束

- 租户必须已经存在超级管理员账号，否则重置应直接失败并提示。
- 新密码只在前端成功弹窗时展示一次，管理员关闭弹窗后若未保存，需要再次发起重置。
- 操作折叠后，低频功能从行内主视图转移到“更多”菜单，需通过使用说明同步告知。
