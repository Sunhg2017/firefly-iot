# OTA 升级运维说明

> **模块**: firefly-device、firefly-connector
> **版本**: v1.0.0

---

## 1. 部署与迁移

- 新增迁移 `V30__enhance_ota_task_execution.sql`，随 `firefly-device` 启动执行。
- 依赖：PostgreSQL、Kafka、MinIO（固件文件）。

## 2. 配置项

| 配置 | 环境变量 | 默认 | 说明 |
| --- | --- | --- | --- |
| `firefly.ota.signature-public-key` | `FIREFLY_OTA_SIGNATURE_PUBLIC_KEY` | 空 | 固件摘要验签公钥（PEM） |
| `firefly.ota.signature-algorithm` | `FIREFLY_OTA_SIGNATURE_ALGORITHM` | `SHA256withRSA` | 签名算法 |

> 固件携带签名但未配置公钥时，`verify` 会失败并提示配置公钥；未携带签名时只校验摘要格式。

## 3. 运行链路

1. 上传固件到 MinIO（support 服务返回 `url/objectName/md5Checksum`）。
2. 创建固件记录（可携带 `sha256Checksum`、`signature`）。
3. `verify` → `release`。
4. 创建升级任务：展开设备、写任务设备、投递 `OTA_UPGRADE`。
5. 设备上报 `device.ota.progress`，服务回写进度并汇总任务。
6. 设备反馈失败时任务计数增加，全部终态后任务结束。

## 4. 监控与日志

| 指标 | 说明 |
| --- | --- |
| `firefly.ota.progress.received` | OTA 进度上报计数 |
| `firefly.device.message.downstream{type="OTA_UPGRADE"}` | 升级指令下行计数 |

日志关键字：

- `OTA task created and dispatched`：任务创建与下发。
- `OTA progress updated`：逐设备进度更新。
- `Firmware verified`：固件校验通过。

## 5. 死信

升级指令消费失败会进入 `device.message.down.dlt`；进度消息处理失败会进入 `device.ota.progress.dlt`。排查后可从死信重投。

## 6. 常见故障

| 现象 | 排查 |
| --- | --- |
| 创建任务提示"没有匹配的升级设备" | 检查产品下设备是否存在、源版本是否匹配、`deviceIds` 是否正确 |
| 任务一直执行中 | 设备未上报进度；检查设备是否收到 `thing/ota/upgrade` 主题 |
| 进度记录未更新 | 检查 payload 是否含 `taskId`；多任务并行时建议显式携带 |
| 固件校验失败 | 检查摘要长度/字符、是否配置公钥、签名是否对 SHA-256 摘要字节签名 |
| 设备升级失败 | 查看 `ota_task_devices.error_message` 与设备日志 |

## 7. 回滚

- 代码回退 `firefly-device` / `firefly-connector` 镜像。
- `V30` 为增量列迁移，回滚不要求删除列。
- 进行中的任务取消后不会继续下发；已下发设备的升级无法由平台回滚，需设备侧支持。

## 8. 后续

- 灰度分批与暂停/继续。
- 设备侧断点续传与差分升级。
- 完整文件级摘要校验（下载固件后重算）。
