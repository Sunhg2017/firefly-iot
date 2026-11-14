# 可观测性设计方案（指标 + 监控栈）

> **版本**: v1.0.0
> **日期**: 2026-11-15
> **模块**: firefly-common、各业务服务、deploy/observability

---

## 1. 背景

第二轮商用就绪度审计（P1-20）指出：全仓无 `micrometer-registry-*` 依赖，配置虽暴露 `prometheus` 端点但实际 404；无 Prometheus/Grafana/Alertmanager；无在线设备、消息吞吐、规则/流转失败等业务指标。故障只能 tail 日志，无法回答 SLA、积压与丢消息问题。

## 2. 目标与范围

- 所有启动服务真实暴露 `/actuator/prometheus`。
- 提供设备/消息/规则/流转/OTA 等业务指标。
- 提供 Prometheus + Alertmanager + Grafana 一键编排、抓取配置、告警规则与概览看板。

不在本轮范围：集中日志（Loki/ELK）、链路后端（Tempo/Jaeger）——TraceID 已存在，后端接入作为后续项。

## 3. 设计

### 3.1 指标注册

- `firefly-common/pom.xml` 引入 `micrometer-registry-prometheus`，随 common 传递到全部服务。
- 各服务 `management.endpoints.web.exposure.include` 已含 `prometheus`，注册表就绪后端点即生效。

### 3.2 业务指标门面

`com.songhg.firefly.iot.common.metrics.Metrics` 为静态门面：

- `MetricsBinder` 启动时把 Spring 的 `MeterRegistry` 绑定到门面；
- 未绑定（单测、未启用 actuator）时全部方法空操作，不影响原链路；
- 提供 `increment(name, tags...)` 与 `gaugeOnce(name, supplier, tags...)`。

### 3.3 指标清单

| 指标 | 类型 | 标签 | 打点位置 |
| --- | --- | --- | --- |
| `firefly.device.online` | Gauge | - | 设备域启动时注册，抓取时实时查库 |
| `firefly.device.message.consumed` | Counter | `source` | `DeviceMessageConsumer` |
| `firefly.device.message.failed` | Counter | `source` | `DeviceMessageConsumer` |
| `firefly.device.message.downstream` | Counter | `type` | `DeviceMessageProducer` |
| `firefly.ota.progress.received` | Counter | - | `MessageRouterService` |
| `firefly.rule.execution.success/failed` | Counter | - | `RuleRuntimeService` |
| `firefly.dataforward.execution.success/failed` | Counter | `target` | `DataForwardRuntimeService` |

HTTP/JVM 指标由 Spring Boot Actuator + Micrometer 自动提供（`http_server_requests_*`、`jvm_memory_*`、`process_cpu_usage` 等）。

### 3.4 监控栈

- `prometheus`：抓取 8 个服务的 `/actuator/prometheus`，加载告警规则。
- `alertmanager`：告警分组与抑制，默认 webhook receiver。
- `grafana`：预置 Prometheus 数据源与「Firefly IoT 概览」看板（服务在线、API QPS、5xx 比例、消息吞吐、在线设备、规则/流转执行、JVM 堆、CPU）。

## 4. 关键取舍

- **静态门面**：避免给既有服务构造函数注入 `MeterRegistry` 导致大范围改动与测试破坏；代价是打点依赖全局状态，单测中为空操作。
- **在线设备用 Gauge 查库**：Prometheus 抓取时实时统计，避免额外定时任务；代价是抓取频率即查询频率（默认 15s）。
- **服务标签由抓取配置注入**：`service` 标签来自 `prometheus.yml`，避免每个服务重复配置 `management.metrics.tags`。

## 5. 风险

- 在线设备 Gauge 为全租户统计，若后续需要按租户拆分需改为带标签的 MultiGauge。
- 告警阈值（5xx 5%、失败速率 1/s）为初始值，需结合真实流量调整。
- 未接入日志聚合，排障仍需登录容器查看日志。

## 6. 关联文档

- [运维说明](../operations/observability.md)
- [使用说明](../user-guide/observability.md)
