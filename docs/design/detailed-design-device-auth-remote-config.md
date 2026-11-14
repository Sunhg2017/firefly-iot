# 设备接入认证、远程配置与批量操作 设计方案

> **版本**: v1.0.0
> **日期**: 2026-11-15
> **模块**: firefly-device（主）、firefly-connector（接入认证）、firefly-common（枚举）、firefly-system（菜单权限）
> **状态**: Draft

---

## 1. 背景

上一轮审视确认三处缺口：

1. **接入协议与认证**：`DeviceAuthType` 只有一机一密/一型一密；缺少 X.509 证书认证、SAS Token 时效令牌；MQTT Broker 无 TLS 监听；LwM2M 只有枚举无适配器；MQTT 5.0 未验证。
2. **远程配置**：只有设备影子的 desired/reported，没有「配置模板 + 版本管理 + 按产品/分组/设备下发 + 回滚 + 下发结果」的独立能力。
3. **批量操作**：只有批量创建/导入，缺少批量启用、停用、删除、打标、分组、命令下发。

## 2. 目标与范围

### 2.1 目标

- 认证：新增 `X509`、`SAS_TOKEN` 两种产品认证方式，支持设备证书登记、指纹认证、SAS 时效令牌签发与校验；MQTT 支持服务端 TLS 监听。
- 远程配置：配置模板 + 不可变版本 + 按目标下发到设备影子期望值与下行 `PROPERTY_SET` + 下发记录与回滚。
- 批量操作：设备批量启用/停用/删除/打标/分组/命令下发，返回逐条结果。

### 2.2 明确不做

- 不实现完整 LwM2M 服务端（Leshan 集成）与 MQTT 5.0 特性；在文档中记录现状、替代方案与后续计划，不以占位实现冒充完成。
- 不实现真正的 mTLS 客户端证书链校验（Moquette 认证接口不暴露客户端证书）；X.509 采用「证书指纹作为接入凭据」的落地方式，并明确其安全边界。
- 远程配置不实现复杂变量插值与模板继承，首版为整份配置下发。

## 3. 认证补全设计

### 3.1 认证方式

`DeviceAuthType` 扩展为：

| 值 | 说明 | 凭据 |
| --- | --- | --- |
| `DEVICE_SECRET` | 一机一密 | deviceSecret |
| `PRODUCT_SECRET` | 一型一密（动态注册换 deviceSecret） | deviceSecret |
| `X509` | 证书指纹认证 | 设备证书 SHA-256 指纹 |
| `SAS_TOKEN` | 时效令牌 | `base64url(payload).base64url(hmac)` |

设备侧认证入口统一为 `DeviceCredentialService.authenticate(productKey, deviceName, credential)`，按产品 `deviceAuthType` 分流。

- X509：凭据为指纹，校验 `device_certificate` 中存在启用、未过期、未吊销且指纹匹配的记录。
- SAS_TOKEN：校验载荷中的 deviceId/productId、过期时间与 HMAC-SHA256 签名（密钥为 deviceSecret）。

### 3.2 设备证书

表 `device_certificate`：

| 字段 | 说明 |
| --- | --- |
| id / tenant_id / device_id | 归属 |
| serial_number / subject_dn | 证书序列号与主体 |
| fingerprint_sha256 | 唯一指纹 |
| certificate_pem | 证书内容 |
| status | ACTIVE / REVOKED |
| valid_from / valid_to | 有效期 |
| created_by / created_at / updated_at | 审计 |

接口：登记、列表、吊销、删除。X509 认证只接受 ACTIVE 且未过期的证书指纹。

### 3.3 SAS Token

签发：`POST /devices/{id}/sas-token?ttlSeconds=`，返回 `{token, expiresAt}`。载荷包含 `deviceId`、`tenantId`、`productId`、`exp`，签名密钥为设备密钥。
校验：`DeviceCredentialService.authenticate` 中按 `SAS_TOKEN` 解析并校验签名与过期。

### 3.4 MQTT TLS

`firefly.mqtt` 新增 `sslEnabled`、`sslPort`、`keyStorePath`、`keyStorePassword` 配置，Broker 在启用时额外启动 TLS 监听。

## 4. 远程配置设计

### 4.1 数据模型

`device_remote_config`（配置模板）：

| 字段 | 说明 |
| --- | --- |
| id / tenant_id / project_id | 归属 |
| name / description | 名称与描述 |
| target_type / target_id | PRODUCT / GROUP / DEVICE |
| config_json | 配置内容（JSONB） |
| version | 当前版本号 |
| status | DRAFT / PUBLISHED / DISABLED |
| created_by / created_at / updated_at | 审计 |

`device_remote_config_version`：`config_id` + `version` + `config_json` + `created_by` + `created_at`，版本不可变。

`device_remote_config_assignment`：`config_id` + `config_version` + `device_id` + `status`（PENDING/DELIVERED/ACKED/FAILED）+ `message_id` + `error_message`。

### 4.2 流程

1. 创建配置（DRAFT）。
2. 编辑内容后「发布」→ version + 1，写入版本表，状态 PUBLISHED。
3. 「下发」→ 按目标解析设备列表，逐设备：
   - 合并写入影子 `desired`；
   - 生成 `PROPERTY_SET` 下行消息到 `device.message.down`；
   - 记录 assignment（DELIVERED 或 FAILED）。
4. 设备回 `PROPERTY_SET_REPLY` 时由 `MessageRouterService` 将对应 assignment 标记 ACKED。
5. 「回滚」→ 以历史版本内容发布为新版本，再下发。

### 4.3 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/remote-configs` | 创建 |
| POST | `/api/v1/remote-configs/list` | 分页 |
| GET/PUT/DELETE | `/api/v1/remote-configs/{id}` | 详情/更新/删除 |
| PUT | `/api/v1/remote-configs/{id}/publish` | 发布新版本 |
| PUT | `/api/v1/remote-configs/{id}/disable` | 停用 |
| POST | `/api/v1/remote-configs/{id}/deploy` | 下发 |
| GET | `/api/v1/remote-configs/{id}/versions` | 版本列表 |
| POST | `/api/v1/remote-configs/{id}/rollback` | 回滚到指定版本 |
| POST | `/api/v1/remote-configs/{id}/assignments/list` | 下发记录 |

## 5. 批量操作设计

| 方法 | 路径 | 权限 | 说明 |
| --- | --- | --- | --- |
| POST | `/api/v1/devices/batch-enable` | device:update | 批量启用 |
| POST | `/api/v1/devices/batch-disable` | device:update | 批量停用 |
| POST | `/api/v1/devices/batch-delete` | device:delete | 批量删除 |
| POST | `/api/v1/devices/batch-tag` | device:update | 批量打标（覆盖 or 追加） |
| POST | `/api/v1/devices/batch-group` | device:update | 批量加入/移出分组 |
| POST | `/api/v1/devices/batch-command` | device:control | 批量下发命令 |

统一返回 `{requested, success, failed, failures:[{deviceId, reason}]}`；逐条 try/catch，单条失败不影响其他设备。

## 6. 权限与菜单

新增租户菜单「远程配置」（`/remote-config`，`remote-config:read/create/update/delete/deploy`），通过 Flyway 维护 `workspace_menu_catalog`、`workspace_menu_permission_catalog`、`permission_resources`、`role_permissions`。批量操作复用设备菜单既有权限。

## 7. 风险与取舍

- X.509 指纹认证不是完整 mTLS；指纹泄露可重放，需配合 TLS 与短期证书轮换。已在运维文档明确。
- SAS Token 以 deviceSecret 为 HMAC 密钥，设备密钥泄露即令牌可伪造；建议高安全场景使用 X509。
- 远程配置下发为「影子期望值 + 下行消息」，是否生效取决于设备实现；assignment 状态以平台投递与设备回复为准。
- 批量删除为逻辑删除，逐条失败不阻断；大批量操作建议分批调用。

## 8. 关联文档

- [运维说明](../operations/device-auth-remote-config-operations.md)
- [使用说明](../user-guide/device-auth-remote-config.md)
