# 设备认证、远程配置与批量操作 使用说明

> **适用角色**: 租户管理员、租户运维（远程配置需 `remote-config:*`；批量操作需 `device:update/delete/control`）

---

## 1. 设备认证方式

产品表单「认证方式」新增：

- **X.509 证书**：设备证书指纹作为接入凭据。需先在设备「安全」抽屉登记证书。
- **SAS 令牌**：平台签发的时效令牌（默认 1 小时），适合临时接入与调试。

### 1.1 登记 X.509 证书

1. 设备列表 → 行操作「安全」。
2. 点击「登记 X.509 证书」，粘贴 PEM 内容。
3. 保存后平台计算 SHA-256 指纹；设备以该指纹作为 MQTT 密码接入。
4. 证书可「吊销」（停止认证）或「删除」。

### 1.2 签发 SAS 令牌

1. 设备「安全」抽屉 → 「签发 SAS 令牌」。
2. 令牌仅展示一次，显示过期时间。
3. 设备以该令牌作为 MQTT 密码接入。

> 高安全场景优先使用 X.509；SAS 令牌以设备密钥为签名密钥，设备密钥泄露即可伪造。

---

## 2. 远程配置

### 2.1 创建与发布

1. 进入「设备资产」→「远程配置」。
2. 「新建配置」：填写名称、目标类型（产品/分组/设备）、目标、配置内容（JSON 对象）。
3. 保存后为草稿；点击「发布」生成版本（v1、v2…）。

### 2.2 下发

1. 已发布配置点击「下发」。
2. 平台解析目标设备，逐设备：
   - 写入设备影子 `desired`；
   - 投递 `PROPERTY_SET` 下行。
3. 弹窗显示「共 X 台，成功 Y，失败 Z」。

### 2.3 查看下发记录与回执

- 「下发记录」查看每台设备状态：已投递 / 已确认 / 失败。
- 设备回执 `PROPERTY_SET_REPLY` 后状态变为「已确认」。

### 2.4 回滚

- 「版本」查看历史版本，点击「回滚」会以该版本内容发布为新版本，再按需重新下发。

### 2.5 限制

- 仅已发布配置可下发。
- 下发依赖设备实现属性设置；平台只保证影子期望值与下行投递，不保证设备一定执行。
- 目标产品/分组下设备较多时，下发为逐设备同步执行，建议分组分批。

---

## 3. 批量操作

设备列表勾选设备后，出现批量操作条：

| 操作 | 说明 |
| --- | --- |
| 批量启用/停用 | 逐设备校验数据范围 |
| 批量删除 | 逻辑删除 |
| 批量打标 | 覆盖或追加标签 |
| 批量分组 | 替换 / 加入 / 移出分组 |
| 批量命令 | 属性设置或服务调用下发 |

结果提示成功/失败数量；单条失败不影响其他设备。

---

## 4. API

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET/POST | `/DEVICE/api/v1/devices/{id}/certificates` | 证书列表/登记 |
| PUT/DELETE | `/DEVICE/api/v1/devices/{id}/certificates/{certId}` | 吊销/删除 |
| POST | `/DEVICE/api/v1/devices/{id}/sas-token` | 签发 SAS 令牌 |
| POST | `/DEVICE/api/v1/remote-configs` | 创建远程配置 |
| POST | `/DEVICE/api/v1/remote-configs/list` | 分页查询 |
| PUT | `/DEVICE/api/v1/remote-configs/{id}/publish` | 发布版本 |
| POST | `/DEVICE/api/v1/remote-configs/{id}/deploy` | 下发 |
| GET | `/DEVICE/api/v1/remote-configs/{id}/versions` | 版本列表 |
| POST | `/DEVICE/api/v1/remote-configs/{id}/rollback` | 回滚 |
| POST | `/DEVICE/api/v1/remote-configs/{id}/assignments/list` | 下发记录 |
| POST | `/DEVICE/api/v1/devices/batch-*` | 批量操作 |

---

## 5. 关联文档

- [设计方案](../design/detailed-design-device-auth-remote-config.md)
- [运维说明](../operations/device-auth-remote-config-operations.md)
