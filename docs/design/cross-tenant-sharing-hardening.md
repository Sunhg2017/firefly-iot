# 跨租户共享能力收口设计

## 背景

本次收口前，跨租户共享模块存在四类问题：

1. `share_policies` 与 `share_audit_logs` 不受 `tenant_id` 拦截器保护，服务层直接 `selectById`，导致具备共享权限的其他租户可通过策略编号越权读取、修改、审批或删除策略。
2. 共享审计日志没有按所有方/消费方做可见范围约束，任意租户可直接按 `policyId` 枚举日志。
3. 共享模块只有策略 CRUD，没有真正可消费的共享设备与共享遥测读取接口，策略批准后无法落地成可用服务。
4. 权限台账口径漂移，控制器把撤销动作挂在 `share:update`，而权限设计文档和权限组种子又保留了 `share:revoke`。

## 目标

- 共享策略生命周期必须严格受 owner / consumer 双边租户边界约束。
- 消费方必须能基于已批准策略查询共享设备、最新属性和历史遥测。
- 审计日志必须记录策略变更和共享数据读取，并且只对相关双方可见。
- 权限模型收口为 `share:create/read/update/delete/approve/revoke` 六个权限点。

## 本次实现范围

### 1. 共享策略边界收口

- `GET /api/v1/share-policies/{id}`
  - owner 可查看任意状态的本方策略。
  - consumer 仅可查看已批准且共享给本租户的策略。
- `PUT /api/v1/share-policies/{id}`
  - 仅 owner 可执行。
  - 已批准策略禁止直接修改，必须先撤销再改。
- `DELETE /api/v1/share-policies/{id}`
  - 仅 owner 可执行。
  - 已批准策略禁止直接删除，必须先撤销再删。
- `POST /api/v1/share-policies/{id}/approve|reject`
  - 仅 owner 可审批待审批策略。
- `POST /api/v1/share-policies/{id}/revoke`
  - 仅 owner 可撤销已批准策略。

### 2. 共享数据读取能力

新增消费方只读接口：

- `GET /api/v1/shared/devices`
  - 返回消费方可访问的共享设备列表。
  - 支持可选 `policyId`，默认聚合当前租户全部已批准策略。
  - 返回结果按 `policyId + deviceId` 维度展开，避免多策略覆盖同一设备时发生隐式合并。
- `GET /api/v1/shared/devices/{deviceId}/properties?policyId=...`
  - 读取共享设备最新属性。
- `GET /api/v1/shared/devices/{deviceId}/telemetry?policyId=...`
  - 读取共享设备历史遥测。
  - 若策略配置了 `telemetryHistory.maxDays`，服务会自动把开始时间收口到允许窗口内。

### 3. 审计日志

新增或收口以下审计动作：

- `POLICY_CREATE`
- `POLICY_UPDATE`
- `POLICY_DELETE`
- `POLICY_APPROVE`
- `POLICY_REJECT`
- `POLICY_REVOKE`
- `QUERY_DEVICES`
- `QUERY_PROPERTIES`
- `QUERY_TELEMETRY`

审计日志查询范围：

- owner 可查看自己发布策略的所有日志。
- consumer 仅可查看共享给自己的、且已批准策略的日志。

## 共享范围与权限解析

### 共享范围

本次运行时只对以下字段做确定性解析：

- `scope.productKeys`
- `scope.deviceNames`
- `scope.productKey`
- `scope.deviceName`

若策略 JSON 不合法，或不包含上述任一选择器，则策略被视为不可执行配置。

### 数据权限

本次运行时只对以下开关生效：

- `dataPermissions.properties`
- `dataPermissions.telemetry`
- `dataPermissions.telemetryHistory.enabled`
- `dataPermissions.telemetryHistory.maxDays`

缺省情况下按最保守原则处理：未明确授权则不允许读取对应数据。

### 脱敏

本次运行时支持以下规则：

- `MASK_ALL`
- `MASK_MIDDLE`
- `ROUND_n`

兼容两种配置格式：

- 对象格式：`{"imei":"MASK_MIDDLE","latitude":"ROUND_2"}`
- 数组格式：`[{"field":"payload.imei","strategy":"MASK_MIDDLE"}]`

## 服务边界

- `firefly-rule`
  - 负责策略鉴权、生命周期管理、共享数据外部接口和共享审计。
- `firefly-device`
  - 提供内部只读接口，负责按 owner tenant 解析设备范围与读取遥测数据。
- `firefly-api`
  - 提供跨服务 Feign DTO 与客户端定义。

## 权限模型

统一收口为以下权限点：

- `share:create`
- `share:read`
- `share:update`
- `share:delete`
- `share:approve`
- `share:revoke`

其中 `share:revoke` 不再借道 `share:update`。

## 风险与后续

- 旧库中若存在 `scope` 为空、`scope` 非法 JSON、或数据权限缺失的共享策略，需要运维清理或重建。
- 当前交付只覆盖共享设备列表、最新属性、历史遥测查询；实时订阅链路不在本次实现范围内，不再把未落地接口继续视为已完成能力。
