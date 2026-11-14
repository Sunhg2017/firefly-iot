# 设备认证、远程配置与批量操作 运维说明

> **模块**: firefly-device（认证、远程配置、批量操作）、firefly-connector（MQTT TLS/认证分流）、firefly-system（菜单权限）
> **版本**: v1.0.0

---

## 1. 部署与依赖

- 随 `firefly-device` / `firefly-connector` 发布，无新增独立服务。
- 新增迁移 `V29__init_device_auth_remote_config.sql`：`device_certificate`、`device_remote_config`、`device_remote_config_version`、`device_remote_config_assignment`。
- 新增菜单/权限迁移 `V42__add_remote_config_menu.sql`。
- 依赖：PostgreSQL、Redis（设备会话）、Kafka（下行消息）。

## 2. 认证配置

### 2.1 认证方式

产品 `device_auth_type` 支持：`DEVICE_SECRET`、`PRODUCT_SECRET`、`X509`、`SAS_TOKEN`。认证由 `DeviceCredentialService` 按产品类型分流。

| 方式 | 设备接入凭据 | 说明 |
| --- | --- | --- |
| DEVICE_SECRET / PRODUCT_SECRET | deviceSecret | 现有方式 |
| X509 | 证书 SHA-256 指纹 | 需先登记证书；只接受启用且未过期 |
| SAS_TOKEN | 平台签发的时效令牌 | HMAC-SHA256，默认有效期 1 小时 |

### 2.2 MQTT TLS

| 变量 | 默认值 | 说明 |
| --- | --- | --- |
| `FIREFLY_MQTT_SSL_ENABLED` | `false` | 是否启用 TLS 监听 |
| `FIREFLY_MQTT_SSL_PORT` | `8883` | TLS 端口 |
| `FIREFLY_MQTT_KEY_STORE_PATH` | 空 | JKS keystore 路径 |
| `FIREFLY_MQTT_KEY_STORE_PASSWORD` | 空 | keystore 密码 |
| `FIREFLY_MQTT_KEY_MANAGER_PASSWORD` | 空 | key 密码（留空取 keystore 密码） |

> `ssl-enabled=true` 但未配置 keystore 时，Broker 拒绝启动。当前 TLS 只提供服务端证书加密；客户端证书链校验未在 Moquette 认证接口中暴露，X.509 采用「证书指纹作为接入凭据」实现。

## 3. 远程配置

- 配置模板按产品/分组/设备下发；发布生成不可变版本；下发写入设备影子 `desired` 并投递 `PROPERTY_SET` 下行。
- 设备回执 `PROPERTY_SET_REPLY` 后，最近一条已投递记录标记为 `ACKED`。
- 下发状态：`PENDING`（预留）、`DELIVERED`、`ACKED`、`FAILED`。

## 4. 批量操作

- 接口：`batch-enable/disable/delete/tag/group/command`，逐设备执行并返回 `{requested, success, failed, failures}`。
- 单条失败不阻断其他设备；批量删除为逻辑删除。
- 批量命令走与单设备相同的下行链路（`device.message.down`）。

## 5. 日志定位

- 认证失败：`DeviceCredentialService` 返回错误码（`INVALID_CERTIFICATE`、`INVALID_SAS_TOKEN`、`INVALID_SECRET`）。
- 远程配置：`Remote config published/deployed/rollback prepared`；下发失败 `Remote config deploy failed`。
- 批量操作：`Batch device operation failed`。

## 6. 常见故障

| 现象 | 排查 |
| --- | --- |
| X.509 设备认证失败 | 确认产品 `device_auth_type=X509`、证书已登记且 ACTIVE、未过期、设备以指纹作为 MQTT 密码 |
| SAS 令牌认证失败 | 确认令牌未过期、设备/租户/产品与载荷一致、设备密钥未轮换 |
| 远程配置下发 0 台 | 确认目标产品/分组下有未删除设备、配置已发布 |
| 下发记录一直 DELIVERED | 设备未回执 PROPERTY_SET_REPLY，或设备未实现属性设置响应 |
| 批量操作部分失败 | 查看返回 `failures` 中 deviceId 与原因；常见为数据范围越权或设备不存在 |
| MQTT TLS 启动失败 | 检查 keystore 路径/密码；确认 `ssl_port` 未被占用 |

## 7. 回滚

- 代码回退 `firefly-device` / `firefly-connector` / `firefly-web` 镜像即可。
- 新增表与菜单为幂等迁移，回滚不要求删除数据。
- 远程配置回滚使用接口「回滚到历史版本」，会以旧内容发布为新版本。
