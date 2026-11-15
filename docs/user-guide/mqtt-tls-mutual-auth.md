# MQTT TLS / mTLS 使用说明

## 1. 适用角色

- **平台运维 / 部署工程师**：为 `firefly-connector` 配置 TLS 与双向认证证书。
- **设备接入开发**：了解设备侧应使用 `mqtts://` 连接、双向认证下如何携带客户端证书。

## 2. 前置条件

- 已按 [运维说明](mqtt-tls-mutual-auth.md)（`docs/operations/mqtt-tls-mutual-auth.md`）生成并放置 keystore / truststore。
- 已在 `deploy/.env` 中配置 `FIREFLY_MQTT_SSL_ENABLED=true`（单向）或叠加 `FIREFLY_MQTT_CLIENT_AUTH=REQUIRE`（双向）。
- 设备仍按既有方式持有设备三元组（一机一密）或已完成动态注册。

## 3. 单向 TLS（服务端证书）

### 3.1 平台侧

```bash
# deploy/.env
FIREFLY_MQTT_SSL_ENABLED=true
FIREFLY_MQTT_SSL_PORT=8883
FIREFLY_MQTT_KEY_STORE_TYPE=JKS
FIREFLY_MQTT_KEY_STORE_PATH=/etc/firefly/certs/mqtt-server.jks
FIREFLY_MQTT_KEY_STORE_PASSWORD=<口令>
```

### 3.2 设备侧

设备改用 TLS 端口 8883，并信任服务端证书（CA 或证书本身）：

```bash
# mosquitto_pub 示例（需将服务端 CA/证书加入本机信任或通过 --cafile 指定）
mosquitto_pub -h <broker> -p 8883 \
  --cafile ./server-ca.crt \
  -u <deviceName> -P <deviceSecret> \
  -t '/sys/<productKey>/<deviceName>/thing/property/post' \
  -m '{"temperature": 25.5}'
```

## 4. 双向认证（mTLS，`CLIENT_AUTH=REQUIRE`）

### 4.1 平台侧

在单向配置基础上追加：

```bash
FIREFLY_MQTT_CLIENT_AUTH=REQUIRE
FIREFLY_MQTT_TRUST_STORE_TYPE=JKS
FIREFLY_MQTT_TRUST_STORE_PATH=/etc/firefly/certs/mqtt-device-ca.jks
FIREFLY_MQTT_TRUST_STORE_PASSWORD=<口令>
```

### 4.2 设备侧

设备需携带客户端证书与私钥：

```bash
# mosquitto_pub 示例
mosquitto_pub -h <broker> -p 8883 \
  --cafile ./server-ca.crt \
  --cert ./device-0001.crt \
  --key ./device-0001.key \
  -u <deviceName> -P <deviceSecret> \
  -t '/sys/<productKey>/<deviceName>/thing/property/post' \
  -m '{"temperature": 25.5}'
```

> `--cert`/`--key` 为设备客户端证书与私钥；设备证书必须由平台 truststore 内受信任的 CA 签发。

## 5. 验证方法

### 5.1 验证 TLS 端口可握手（不依赖设备 SDK）

```bash
openssl s_client -connect <broker>:8883 -showcerts </dev/null
# 输出应展示服务端证书链，且 Protocol 为 TLSv1.2 或 TLSv1.3
```

### 5.2 验证双向认证生效

- 不带客户端证书连接应被拒绝：

  ```bash
  openssl s_client -connect <broker>:8883 </dev/null
  # 期望：握手失败 / alert certificate required
  ```

- 带客户端证书连接应成功（证书由受信任 CA 签发时）。

## 6. 注意事项与限制

1. **明文 1883 是否保留由部署策略决定**：启用 TLS 并不自动关闭 1883；全面切换 TLS 时应在 Compose 中移除明文端口映射。
2. **mTLS 只验证证书信任链**，不自动把证书 CN 与设备三元组绑定；设备仍需通过 MQTT CONNECT 的用户名/口令认证。
3. **证书吊销**：当前无 CRL/OCSP，吊销通过轮换 truststore（移除被吊销 CA）实现。
4. **协议版本**：默认仅 `TLSv1.2`/`TLSv1.3`，设备 SDK 需支持其一；过旧设备（仅 TLS 1.0/1.1）将无法连接，可通过 `FIREFLY_MQTT_PROTOCOLS` 谨慎放开，但默认不推荐。
5. **证书口令安全**：`.env` 中的口令属敏感信息，生产建议接入 KMS/Secret 注入，避免明文落盘。

## 7. 关联文档

- [设计说明](mqtt-tls-mutual-auth.md)（`docs/design/mqtt-tls-mutual-auth.md`）
- [运维说明](mqtt-tls-mutual-auth.md)（`docs/operations/mqtt-tls-mutual-auth.md`）
