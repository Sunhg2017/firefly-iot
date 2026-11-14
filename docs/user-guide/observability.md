# 可观测性使用说明

> **适用角色**: 运维、SRE、值班人员

---

## 1. 访问入口

| 入口 | 地址 | 用途 |
| --- | --- | --- |
| Grafana | `http://<host>:3000` | 看板与告警可视化 |
| Prometheus | `http://<host>:9090` | 查询指标、查看抓取目标 |
| Alertmanager | `http://<host>:9093` | 查看/静默告警 |
| 服务指标 | `http://<host>:<port>/actuator/prometheus` | 单服务原始指标 |

Grafana 默认账号 `admin`，密码由 `GRAFANA_ADMIN_PASSWORD` 配置。

## 2. 常用看板

「Firefly IoT 概览」包含：

- **在线服务**：期望 8 个服务全部 up。
- **在线设备**：`firefly_device_online`。
- **OTA 进度上报（累计）**：`firefly_ota_progress_received_total`。
- **设备消息失败速率**：按来源拆分。
- **API 请求速率 / 5xx 比例**：按服务拆分。
- **设备消息吞吐**：上行按来源、下行按消息类型。
- **规则/流转执行**：成功与失败速率。
- **JVM 堆与进程 CPU**：按服务。

## 3. 常用查询

```promql
# 各服务是否在线
up{job=~"firefly-.*"}

# 设备上行消息速率
sum by (source) (rate(firefly_device_message_consumed_total[5m]))

# 设备消息失败
sum by (source) (rate(firefly_device_message_failed_total[5m]))

# 在线设备数
firefly_device_online

# 规则失败
rate(firefly_rule_execution_failed_total[5m])
```

## 4. 告警处置

1. 在 Alertmanager 查看告警详情与触发时间。
2. 到 Grafana 对应面板确认趋势。
3. 按告警说明检查服务日志（`docker logs firefly-<service>`）。
4. 处理完成后确认告警恢复（`send_resolved` 已开启）。

## 5. 注意事项

- 在线设备数按全租户统计，不是单租户口径。
- 指标抓取间隔 15s，短于该间隔的抖动可能被平滑。
- 当前未接入集中日志，排障需登录宿主或容器查看日志。
- 告警阈值需按真实流量调整，默认值仅作初始基线。
