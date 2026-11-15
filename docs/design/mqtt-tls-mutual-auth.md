# MQTT TLS / mTLS 双向认证设计说明

## 1. 背景与目标

内置 MQTT Broker（Moquette 0.17，`firefly-connector`）此前只监听明文 `1883`，设备以 `deviceSecret` 作为 MQTT 口令进行认证。设备口令在网络上明文传输，现场或公网可被嗅探重放，属于商用阻断项（审计 P1-02）。

本次补充目标：

1. 支持在 `8883` 上启用 TLS（服务端证书），加密设备口令与业务消息。
2. 支持双向认证（mTLS / `client-auth=REQUIRE`），设备必须持有由受信任 CA 签发的客户端证书才能建立连接。
3. 服务端证书与客户端 CA 分离管理，口令与轮换生命周期互不影响。
4. 配置校验 fail-fast：缺失关键配置时拒绝启动，杜绝“声明 TLS 却明文监听 / 声明 mTLS 却单向认证”的静默降级。
5. TLS 协议钉在 `TLSv1.2` / `TLSv1.3`，不回落已废弃版本。

## 2. 范围

### 2.1 范围内

- 内置 Broker 的 TLS 服务端监听（`ssl-port`）。
- 客户端证书校验：`NONE`（单向 TLS）/ `OPTIONAL`（请求不强制）/ `REQUIRE`（强制，即双向认证）。
- keystore / truststore 分离、JKS 与 PKCS12 两种 `KeyStore` 类型。
- TLS 协议版本白名单。
- 配置模型、环境变量、Docker 证书卷挂载与三类文档。

### 2.2 范围外（已知限制，暂不实现）

- **证书吊销（CRL/OCSP）**：Moquette 0.17 与本次实现均未接入 CRL/OCSP；吊销通过轮换 truststore（移除被吊销的 CA/证书）实现，轮换期间需分批重启 `connector`。
- **设备证书在线签发 / 注册（PKI enrollment）**：本次只做传输层 mTLS，证书的签发、下发仍由外部 PKI / 证书体系完成，平台不自动为每台设备签发证书。
- **证书与设备身份的绑定校验**：mTLS 只验证“客户端证书由受信任 CA 签发”，是否把证书 CN 与设备三元组绑定并据此授权，属于后续认证语义扩展，不在本范围。
- **双向认证对 MQTT over WebSocket（WSS）的独立配置**：当前 Moquette 对 WSS 复用同一 `SslContext`，本项目默认不启用 WSS。

## 3. 架构

### 3.1 证书信任模型

| 部件 | 内容 | 用途 | 口令/轮换 |
| --- | --- | --- | --- |
| keystore（`key-store-*`） | 服务端私钥 + 服务端证书链 | TLS 握手时向设备证明 Broker 身份 | 私钥口令独立保护，服务端证书到期单独轮换 |
| truststore（`trust-store-*`） | 受信任的客户端 CA（或客户端证书） | 校验设备客户端证书的信任链 | 独立口令，设备 CA 轮换 / 吊销单独维护 |

> 与 Moquette 默认实现（`DefaultMoquetteSslContextCreator`）的关键差异：Moquette 在 `need_client_auth=true` 时把 keystore 兼作 truststore；本实现分离两者，避免服务端私钥与受信任 CA 共用同一口令、同一轮换周期。

### 3.2 组件

- `MqttProperties`：承载 `firefly.mqtt` 下全部 TLS/mTLS 配置，并提供 `validateTlsConfig()` fail-fast 校验与 `effectiveKeyManagerPassword()` 回退。
- `FireflyMqttSslContextCreator`（`io.moquette.broker.ISslContextCreator` 实现）：用 JDK `SslContextBuilder.forServer(KeyManagerFactory)` 构建 `SslContext`，按 `client-auth` 挂载 truststore 与 `ClientAuth`，并 `protocols(...)` 钉协议版本。
- `EmbeddedMqttBroker`：启动时调用 `validateTlsConfig()`，设置 Moquette 的 SSL 相关属性，并在 `client-auth=REQUIRE` 时置 `need_client_auth=true`（Moquette `createSslHandler` 据此调用 `sslEngine.setNeedClientAuth(true)`），随后把自定义 creator 传入 `Server.startServer`。

### 3.3 客户端认证模式

| `client-auth` | truststore | Moquette `need_client_auth` | 行为 |
| --- | --- | --- | --- |
| `NONE` | 不加载 | `false` | 仅服务端证书，设备验证 Broker 身份，Broker 不校验设备证书 |
| `OPTIONAL` | 加载 | `false` | 请求客户端证书但不强制；`ClientAuth.OPTIONAL` 即 `setWantClientAuth(true)` |
| `REQUIRE` | 加载 | `true` | 强制客户端证书；握手失败即断开 |

## 4. 配置项

完整配置见 `application.yml` 的 `firefly.mqtt` 段与 `deploy/.env.example`，核心项：

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `firefly.mqtt.ssl-enabled` | `false` | 是否启用 TLS 监听 |
| `firefly.mqtt.ssl-port` | `8883` | TLS 监听端口 |
| `firefly.mqtt.key-store-type` | `JKS` | 服务端 keystore 类型（`JKS`/`PKCS12`） |
| `firefly.mqtt.key-store-path` | 空 | 服务端 keystore 路径（启用时必填） |
| `firefly.mqtt.key-store-password` | 空 | 服务端 keystore 口令（启用时必填） |
| `firefly.mqtt.key-manager-password` | 空 | 服务端私钥口令，留空回退 keystore 口令 |
| `firefly.mqtt.client-auth` | `NONE` | `NONE`/`OPTIONAL`/`REQUIRE` |
| `firefly.mqtt.trust-store-type` | `JKS` | 客户端 CA truststore 类型 |
| `firefly.mqtt.trust-store-path` | 空 | `client-auth != NONE` 时必填 |
| `firefly.mqtt.trust-store-password` | 空 | `client-auth != NONE` 时必填 |
| `firefly.mqtt.protocols` | `TLSv1.2,TLSv1.3` | 允许的 TLS 协议，逗号分隔 |

## 5. 握手流程（REQUIRE 双向认证）

1. 设备以 `mqtts://broker:8883` 发起 TCP + TLS ClientHello。
2. Broker 返回服务端证书；设备校验其信任链与主机名。
3. Broker 因 `ClientAuth.REQUIRE` 请求客户端证书。
4. 设备发送客户端证书；Broker 用 truststore 校验其信任链。
5. 校验通过后进入 MQTT CONNECT，再按既有 `EmbeddedMqttAuthenticator` 做用户名/口令（设备三元组）认证。
6. 任一环节失败，握手/连接被拒绝。

> 说明：TLS 证书校验（传输层）与设备三元组认证（应用层）是两层独立校验，本次未把二者合并为“证书即身份”，设备仍需按既有方式完成 CONNECT 认证。

## 6. 关键设计取舍

- **只使用 JDK provider（`JdkSslContext`）**：项目未引入 `netty-tcnative-boringssl`，JDK provider 在 Java 21 下原生支持 TLS 1.2/1.3 与 JKS/PKCS12，避免为 OpenSSL 原生库增加部署依赖。因此不暴露 `ssl-provider` 配置，防止配出无法运行的分支。
- **fail-fast 优于降级**：Moquette 默认在 keystore 缺失时仅返回 `null` 并跳过 SSL 初始化；本实现改为在启动前 `validateTlsConfig()` 抛异常，避免“配置了 TLS 却仍只开明文端口”。
- **分离 truststore**：服务端私钥与受信任设备 CA 独立口令、独立轮换，符合最小权限与可运维性要求。

## 7. 风险与限制

1. **明文 1883 默认仍开启**：启用 TLS 后，若仍同时发布 `1883`，设备仍可走明文。生产建议在 `docker-compose.prod.yml` 的 `ports` 中移除或仅在受信网络内保留 `1883` 映射；本实现不强制关闭明文端口，交由部署策略决定。
2. **无 CRL/OCSP**：证书吊销依赖 truststore 轮换（见 2.2）。
3. **多实例证书一致性**：每个 `connector` 副本需挂载同一份证书卷，或由编排平台注入；证书不一致会导致不同节点握手结果不一致。
4. **证书无设备级绑定**：同一 CA 签发的任意证书都能通过 mTLS，需结合应用层设备认证保证“合法设备”语义。

## 8. 回归与验证

- `MqttPropertiesTest`：覆盖 fail-fast 校验与口令回退。
- `FireflyMqttSslContextCreatorTest`：用 `src/test/resources/mqtt-tls` 下的自签名证书 fixture，验证单向/双向/可选三种模式构建出的 `SslContext` 的 `needClientAuth`/`wantClientAuth` 语义，以及缺 truststore / 文件不存在时抛异常。
- 未在本环境执行真实设备端到端 TLS 握手；建议在联调环境用 `mosquitto_pub`/`openssl s_client` 验证单向与双向握手（见使用说明）。
