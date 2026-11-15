# MQTT TLS / mTLS 运维说明

## 1. 部署方式

### 1.1 证书文件准备

在宿主机 `deploy/certs/` 下放置 keystore 与 truststore（该目录已挂载到 `connector` 容器内的 `/etc/firefly/certs`，只读）：

```text
deploy/certs/
├─ mqtt-server.jks      # 服务端私钥 + 证书
└─ mqtt-device-ca.jks   # 受信任的客户端 CA（双向认证时才需要）
```

> `.gitignore` 已忽略 `*.jks` / `*.p12` / `*.keystore`，真实证书不会被提交进仓库。测试用证书 fixture 位于 `firefly-connector/src/test/resources/mqtt-tls/`，口令为公开的 `testpass`，仅用于单测。

### 1.2 启用单向 TLS

在 `deploy/.env` 中配置：

```bash
FIREFLY_MQTT_SSL_ENABLED=true
FIREFLY_MQTT_SSL_PORT=8883
FIREFLY_MQTT_KEY_STORE_TYPE=JKS
FIREFLY_MQTT_KEY_STORE_PATH=/etc/firefly/certs/mqtt-server.jks
FIREFLY_MQTT_KEY_STORE_PASSWORD=<服务端 keystore 口令>
```

### 1.3 启用双向认证（mTLS）

在单向 TLS 基础上追加：

```bash
FIREFLY_MQTT_CLIENT_AUTH=REQUIRE
FIREFLY_MQTT_TRUST_STORE_TYPE=JKS
FIREFLY_MQTT_TRUST_STORE_PATH=/etc/firefly/certs/mqtt-device-ca.jks
FIREFLY_MQTT_TRUST_STORE_PASSWORD=<truststore 口令>
```

随后重建并重启 `connector`：

```bash
cd deploy
bash deploy.sh up
```

### 1.4 端口暴露

`docker-compose.prod.yml` 中 `connector` 已固定映射：

- `1883`（明文，默认）
- `8883`（TLS，仅当 `FIREFLY_MQTT_SSL_ENABLED=true` 时容器内才监听）

生产环境如已全面切换到 TLS，建议在 `docker-compose.prod.yml` 的 `connector.ports` 中移除 `1883` 映射（或仅在受信内网暴露），避免设备仍可回落到明文。

## 2. 配置项速查

| 环境变量 | 默认 | 必填条件 |
| --- | --- | --- |
| `FIREFLY_MQTT_SSL_ENABLED` | `false` | — |
| `FIREFLY_MQTT_SSL_PORT` | `8883` | — |
| `FIREFLY_MQTT_KEY_STORE_TYPE` | `JKS` | SSL 启用 |
| `FIREFLY_MQTT_KEY_STORE_PATH` | 空 | SSL 启用 |
| `FIREFLY_MQTT_KEY_STORE_PASSWORD` | 空 | SSL 启用 |
| `FIREFLY_MQTT_KEY_MANAGER_PASSWORD` | 空 | 可选（留空回退 keystore 口令） |
| `FIREFLY_MQTT_CLIENT_AUTH` | `NONE` | — |
| `FIREFLY_MQTT_TRUST_STORE_TYPE` | `JKS` | `CLIENT_AUTH != NONE` |
| `FIREFLY_MQTT_TRUST_STORE_PATH` | 空 | `CLIENT_AUTH != NONE` |
| `FIREFLY_MQTT_TRUST_STORE_PASSWORD` | 空 | `CLIENT_AUTH != NONE` |
| `FIREFLY_MQTT_PROTOCOLS` | `TLSv1.2,TLSv1.3` | — |

## 3. 依赖服务

- 无新增中间件依赖；TLS 仅依赖容器内文件可读（证书卷）与 JDK 内置加密实现（JCE）。
- 证书卷 `./certs:/etc/firefly/certs:ro` 由 Compose 提供，无需额外网络或密钥管理服务（生产建议接入 KMS/Secret 注入证书口令）。

## 4. 证书生成与轮换

### 4.1 生成自签名服务端证书（示例）

```bash
keytool -genkeypair -alias mqtt-server -keyalg RSA -keysize 2048 -validity 3650 \
  -dname "CN=<broker 域名或 IP>, OU=iot, O=firefly" \
  -storetype JKS -keystore mqtt-server.jks \
  -storepass <keystore 口令> -keypass <keystore 口令>
```

生产应使用内部/公共 CA 签发，避免自签名证书在各设备侧需要逐一导入。

### 4.2 生成客户端 CA 与设备证书（示例）

```bash
# 1) 生成设备 CA
keytool -genkeypair -alias device-ca -keyalg RSA -keysize 2048 -validity 3650 \
  -dname "CN=Firefly Device CA" -storetype JKS \
  -keystore device-ca.jks -storepass <ca 口令> -keypass <ca 口令>
keytool -exportcert -alias device-ca -keystore device-ca.jks \
  -storepass <ca 口令> -rfc -file device-ca.crt

# 2) 用 CA 签发设备证书（生产建议走 PKI/证书管理系统）
keytool -genkeypair -alias device-0001 -keyalg RSA -keysize 2048 -validity 1095 \
  -dname "CN=device-0001" -storetype JKS \
  -keystore device-0001.jks -storepass <设备口令> -keypass <设备口令>
keytool -certreq -alias device-0001 -keystore device-0001.jks \
  -storepass <设备口令> -file device-0001.csr
keytool -gencert -alias device-ca -keystore device-ca.jks \
  -storepass <ca 口令> -infile device-0001.csr -outfile device-0001.crt -validity 1095
keytool -importcert -alias device-ca -file device-ca.crt -keystore device-0001.jks \
  -storepass <设备口令> -noprompt
keytool -importcert -alias device-0001 -file device-0001.crt -keystore device-0001.jks \
  -storepass <设备口令> -noprompt

# 3) 把 CA 证书导入 truststore（Broker 侧信任）
keytool -importcert -alias device-ca -file device-ca.crt \
  -storetype JKS -keystore mqtt-device-ca.jks -storepass <truststore 口令> -noprompt
```

### 4.3 轮换

- **服务端证书轮换**：替换 `mqtt-server.jks` 后滚动重启 `connector` 副本即可，无需改动设备侧（设备校验证书信任链）。
- **设备 CA 轮换 / 吊销**：更新 `mqtt-device-ca.jks`（加入新 CA、移除被吊销 CA）后滚动重启；在移除旧 CA 前需保证仍持旧证书的设备已完成换证。
- 轮换期间可能短暂出现新旧节点握手结果不一致，建议 `connector` 多副本时按节点逐个滚动，并在负载均衡层保证同一设备会话粘滞。

## 5. 监控与日志

- Broker 启动成功日志：`Embedded MQTT broker started ...`；TLS 上下文构建失败会抛 `IllegalStateException: Failed to initialize MQTT TLS context ...` 并使 `connector` 启动失败。
- 配置校验失败会在启动阶段抛出带明确字段名的 `IllegalStateException`（如 `firefly.mqtt.ssl-enabled=true 时必须配置 firefly.mqtt.key-store-path`）。
- 握手失败（证书不受信 / 无客户端证书）由 Netty/Moquette 输出 SSL 告警日志，可用 `deploy.sh logs connector` 排查。
- 现有 Prometheus/Grafana 栈可观察连接数等指标；TLS 握手失败暂无独立指标，如需可后续在 intercept 层补充计数。

## 6. 常见故障与排查

| 现象 | 可能原因 | 排查/处置 |
| --- | --- | --- |
| `connector` 启动即失败 | 缺 keystore/truststore 路径或口令 | 核对 `.env` 的 `FIREFLY_MQTT_*` 与证书卷挂载路径 |
| 报 `keystore/truststore file not found` | 容器内路径错误或证书卷未挂载 | `docker compose exec connector ls -l /etc/firefly/certs` 确认文件存在 |
| 设备握手被拒 | 客户端证书不受信（mTLS） | 确认设备证书由 truststore 内 CA 签发；用 `openssl s_client -connect host:8883` 观察证书链 |
| 设备仍走 1883 明文 | 部署未移除明文端口 | 在 Compose 中移除 `1883` 映射并重建 |
| 密钥库口令错误 | `key-store-password` 与 `key-manager-password` 混淆 | `key-manager-password` 留空会自动回退到 `key-store-password` |

## 7. 回滚

- 将 `FIREFLY_MQTT_SSL_ENABLED` 置回 `false` 并重建 `connector`，即恢复为仅 `1883` 明文监听；设备侧切回 `mqtt://` 即可。
- 回滚不涉及数据库迁移或数据面变更，无需额外数据清理。
