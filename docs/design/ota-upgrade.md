# OTA 升级设计方案（任务展开 + 下发 + 进度回收 + 固件校验）

> **版本**: v1.0.0
> **日期**: 2026-11-15
> **模块**: firefly-device、firefly-connector、firefly-common

---

## 1. 背景

第二轮商用就绪度审计（P0-05）指出：OTA 只有元数据外壳——创建任务不展开设备、不下发升级指令、不回收进度，`total_count` 恒为 0，固件也没有签名校验。

## 2. 目标与范围

- 创建任务时解析目标设备并写入 `ota_task_devices`，`total_count` 反映真实设备数。
- 逐设备投递 `OTA_UPGRADE` 下行，携带固件地址、大小、摘要与签名。
- 消费 `device.ota.progress`，回写逐设备状态/进度并汇总任务计数。
- 固件校验：摘要格式、摘要存在性、可选 RSA/ECDSA 签名验证。
- 前端支持指定设备与查看逐设备进度。

不在本轮范围：灰度分批执行引擎（当前灰度仅按比例选取首 N% 设备）、固件差分升级、设备侧断点续传。

## 3. 数据模型

新增迁移 `V30__enhance_ota_task_execution.sql`：

| 表 | 字段 | 说明 |
| --- | --- | --- |
| `firmwares` | `file_key` | MinIO 对象键 |
| `firmwares` | `sha256_checksum` | SHA-256 摘要 |
| `firmwares` | `signature` | 摘要的 RSA-SHA256 签名（Base64） |
| `ota_task_devices` | `message_id` | 升级指令下行消息号 |

## 4. 流程

### 4.1 创建任务

1. 校验固件存在、已发布、属于所选产品。
2. 解析目标设备：
   - 指定 `deviceIds` → 按 ID 过滤；
   - 未指定 → 按产品 + 可选 `srcVersion` 过滤；
   - 灰度比例 < 100 时取前 N%（按设备 ID 升序）。
3. 写入 `ota_tasks`（`IN_PROGRESS`，`total_count = n`）。
4. 逐设备写入 `ota_task_devices`（`PENDING`）。
5. 逐设备投递 `OTA_UPGRADE` 下行，回写 `message_id` 并置 `DOWNLOADING`。

### 4.2 进度回收

设备上报 `device.ota.progress`，payload 形如：

```json
{ "taskId": 1001, "progress": 60, "status": "UPGRADING", "errorMessage": null }
```

处理逻辑：

1. `taskId` 存在则按任务+设备定位；缺失时取设备最近一条未终结记录。
2. 状态归一化：`FAIL/ERROR` → `FAILURE`；`SUCCESS/DONE/COMPLETE` 或进度 100 → `SUCCESS`；`UPGRAD/INSTALL` → `UPGRADING`；`DOWNLOAD` 或进度 > 0 → `DOWNLOADING`。
3. 回写进度、错误、开始/结束时间。
4. 重算任务计数；全部终态时任务结束：无成功且存在失败 → `FAILED`，否则 `COMPLETED`。

### 4.3 固件校验

`verifyFirmware`：

1. 校验 `md5`（32 位十六进制）与 `sha256`（64 位十六进制）格式。
2. 至少存在一种摘要。
3. 若携带 `signature`：必须配置 `firefly.ota.signature-public-key`，并用 `SHA256withRSA`（或 `SHA256withECDSA`）对 SHA-256 摘要字节验签。

## 5. 下行主题

`OTA_UPGRADE` 映射到 `/sys/{productKey}/{deviceName}/thing/ota/upgrade`（MQTT）。

## 6. 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| POST | `/api/v1/ota-tasks` | 创建并下发（支持 `deviceIds`、`grayRatio`） |
| GET | `/api/v1/ota-tasks/{id}` | 任务详情（含逐设备进度） |
| GET | `/api/v1/ota-tasks/{id}/devices` | 逐设备进度 |
| PUT | `/api/v1/ota-tasks/{id}/cancel` | 取消任务 |
| PUT | `/api/v1/firmwares/{id}/verify` | 固件校验 |

## 7. 关键取舍与风险

- 设备展开与下发在同一事务内：Kafka 发送失败会回滚任务，避免"任务存在但未下发"；但已发送消息无法撤回，设备可能先行升级。建议后续改为 outbox。
- 进度缺失 `taskId` 时按设备最近未终结任务反查，兼容简单设备，但多任务并行时可能匹配到错误任务；设备侧应尽量上报 `taskId`。
- 灰度仅按比例选取设备，不覆盖分批推进与暂停。
- 签名针对摘要字节，平台不重新计算文件摘要（上传时由 support 返回 MD5），完整文件级校验需后续接入文件下载。

## 8. 关联文档

- [运维说明](../operations/ota-upgrade.md)
- [使用说明](../user-guide/ota-upgrade.md)
