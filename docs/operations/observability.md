# 可观测性运维说明

> **模块**: firefly-common、deploy/observability
> **版本**: v1.0.0

---

## 1. 部署

监控栈随 `docker-compose.prod.yml` / `docker-compose.github.yml` 一起启动：

```bash
cd deploy
cp .env.example .env
docker compose -f docker-compose.prod.yml --env-file .env up -d
```

| 组件 | 容器 | 默认端口 | 说明 |
| --- | --- | --- | --- |
| Prometheus | `firefly-prometheus` | 9090 | 指标抓取与告警规则 |
| Alertmanager | `firefly-alertmanager` | 9093 | 告警路由 |
| Grafana | `firefly-grafana` | 3000 | 看板，默认账号 admin |

## 2. 配置项

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PROMETHEUS_PORT` | `9090` | 宿主机端口 |
| `PROMETHEUS_RETENTION` | `15d` | 指标保留时长 |
| `ALERTMANAGER_PORT` | `9093` | 宿主机端口 |
| `GRAFANA_PORT` | `3000` | 宿主机端口 |
| `GRAFANA_ADMIN_PASSWORD` | `admin` | 生产必须修改 |

## 3. 抓取目标

`deploy/observability/prometheus.yml` 默认抓取集群内服务：

| 服务 | 地址 |
| --- | --- |
| gateway | `firefly-gateway:8080` |
| system | `firefly-system:8081` |
| device | `firefly-device:9020` |
| rule | `firefly-rule:9030` |
| media | `firefly-media:9040` |
| data | `firefly-data:9050` |
| support | `firefly-support:9060` |
| connector | `firefly-connector:9070` |

新增服务时在 `scrape_configs` 追加 `job_name` 与目标。

## 4. 告警

`deploy/observability/alerts.yml` 内置：

- `FireflyServiceDown`：服务 2 分钟不可抓取（critical）。
- `FireflyHighHttp5xx`：5xx 比例 > 5% 持续 5 分钟。
- `FireflyJvmHeapHigh`：堆使用率 > 90% 持续 10 分钟。
- `FireflyDeviceMessageFailures`：设备消息消费失败速率 > 1/s。
- `FireflyRuleExecutionFailures`：规则失败速率 > 0.5/s。
- `FireflyDataForwardFailures`：数据流转失败速率 > 0.5/s。
- `FireflyNoDeviceOnline`：在线设备数为 0 持续 10 分钟。

`alertmanager.yml` 默认 webhook 指向 `http://127.0.0.1:5001/alert`，接入企业微信/钉钉/邮件时替换 `receivers`。

## 5. 看板

Grafana 启动后自动加载「Firefly IoT 概览」看板（uid `firefly-overview`），包含服务在线、在线设备、OTA 进度上报、消息失败速率、API QPS、5xx 比例、消息吞吐、规则/流转执行、JVM 堆、CPU。

## 6. 验证

```bash
# 指标端点
curl -s http://<host>:8080/actuator/prometheus | head

# Prometheus 目标
curl -s http://<host>:9090/api/v1/targets | grep -o '"health":"[a-z]*"' | sort | uniq -c

# Grafana
open http://<host>:3000
```

## 7. 故障排查

| 现象 | 排查 |
| --- | --- |
| 目标 down | 确认服务已启动、`/actuator/health` 正常、容器在同一网络 |
| 指标为空 | 确认 `micrometer-registry-prometheus` 在 classpath、端点 exposure 含 `prometheus` |
| 告警不触发 | 检查 `promtool check rules deploy/observability/alerts.yml`、Alertmanager 路由 |
| 看板无数据 | 检查 Grafana 数据源指向 `http://firefly-prometheus:9090` |

## 8. 回滚

- 监控栈与业务服务解耦，可单独 `docker compose stop prometheus alertmanager grafana`。
- 业务指标为空操作不影响业务，回滚代码后指标自然消失。

## 9. 后续

- 集中日志（Loki/Promtail）。
- 链路后端（Tempo/Jaeger）接入 OTLP。
- 按租户维度的设备/消息指标。
