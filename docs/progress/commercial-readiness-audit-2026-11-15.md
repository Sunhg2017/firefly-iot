# Firefly IoT 商用就绪度复审报告（第二轮）

## 1. 报告信息

| 项目 | 内容 |
| --- | --- |
| 报告编号 | FIREFLY-CSA-20261115-02 |
| 报告版本 | 1.0 |
| 生成日期 | 2026-11-15（Asia/Shanghai） |
| 审计对象 | Firefly IoT 平台：能否作为商用 IoT 设备平台对外交付 |
| 审计基线 | `f14433ba6b0e5d383a86da8035250c957bda6f3e`（`master`，与 `origin/master` 一致） |
| 上一轮报告 | [设计与实现审计（FIREFLY-AUDIT-20261115-01）](project-audit-2026-11-15.md) |
| 整改记录 | [AUD-001~014 整改记录](project-audit-2026-11-15-remediation.md) |
| 报告性质 | 源码、配置、部署文件与文档的静态审计；不构成生产环境渗透测试、性能压测或合规认证 |
| 问题状态 | P0 6 项、P1 34 项、P2 12 项，均待整改与回归验证 |

本报告在上一轮 14 项（AUD-001~014）整改完成后的提交 `f14433b` 上重新审查。上一轮聚焦“身份与权限能否绕过、消息会不会丢、导入是否真异步”；本轮聚焦“作为一个要卖给企业客户、要签 SLA、要过安全评审的商用 IoT 平台，还缺什么”。

**结论：当前版本不具备对外商用交付条件。** 可以继续作为内部联调、POC 和受控试点；在完成第 5 节全部 P0 前，不应对外承诺生产 SLA、数据安全或 OTA 能力。

## 2. 执行摘要

### 2.1 总体判断

| 维度 | 判断 | 主要依据 |
| --- | --- | --- |
| 设备接入与资产模型 | 可用 | MQTT/HTTP/CoAP/Modbus/SNMP/LoRaWAN/TCP-UDP/WebSocket、物模型、影子、分组标签拓扑、时序数据均有真实闭环 |
| 身份与权限 | 不达商用基线 | 默认部署密钥公开、设备密钥明文、会话撤销不完整、审计未启用 |
| 消息可靠性 | 不达商用基线 | Kafka 单副本、生产端 fire-and-forget、rule/connector 消费失败被吞、下行离线即丢 |
| 高可用与运维 | 不达商用基线 | 单机单实例、无备份/容灾、无监控告警栈、无优雅停机 |
| 交付与合规 | 不达商用基线 | 无 LICENSE/SBOM/SLA、无数据删除与审计导出、默认弱口令 |
| 商业产品能力 | 有明显空壳 | OTA 只有元数据、套餐/配额/计量缺失、开放 API 仅个位数接口、短信登录不可用 |

### 2.2 最需要先看的结论

1. **“默认部署”本身就是事故现场。** 生产 Compose 默认以 `dev` Profile 启动，仓库内置可直接使用的 RSA 私钥、内部服务令牌和 AppKey 加密密钥；同时 PostgreSQL/Redis/Kafka/Nacos/MinIO 以默认弱口令映射到宿主机 `0.0.0.0`，入口只有 HTTP。拿到仓库的人可以离线签发任意用户的 Token 登录平台（P0-01、P0-02）。
2. **Connector 的 9070 管理端口对公网开放且零鉴权。** 全模块 `@RequiresLogin/@RequiresPermission` 数量为 0，可直接枚举/断开所有 TCP/UDP/WebSocket 会话并下发消息（P0-03）。
3. **OTA 是“菜单有、能力无”。** 创建任务不展开设备、不下发升级指令、不回收进度，`total_count` 恒为 0，固件也没有签名校验（P0-05）。
4. **无法按商用承诺可用性。** 全栈单机、Kafka 单副本、无备份脚本、无监控告警、发布即全站重启；客户问“RTO/RPO 多少”时没有答案（P0-04）。
5. **上一轮 14 项已静态收口，但只解决了“安全边界漏洞”，没有解决“商用产品缺口”。** 修完 AUD-001~014 不等于可以卖。

### 2.3 建议闸门

- **Gate 0（对外演示/POC 前）**：关闭 P0-01/02/03，确保“无凭据直连 5432/6379/9092/9070 全部失败、默认密钥全部失效”。
- **Gate 1（受控试点前）**：完成 P0-04、P1 安全与消息可靠性项（P1-01~P1-19），补齐备份与监控最小集。
- **Gate 2（签生产 SLA 前）**：完成 P0-05、P0-06 与全部 P1，取得压测、备份恢复演练、安全扫描与合规材料。

## 3. 范围、方法与限制

### 3.1 范围

| 领域 | 核查内容 |
| --- | --- |
| 身份与数据安全 | JWT 生命周期、默认密钥、会话撤销、密码与 MFA、设备凭据、MQTT TLS、文件与 SSRF、审计、内部服务边界 |
| 消息与数据面 | Kafka 生产/消费语义、DLT、下行投递、设备影子、告警幂等、时序写入与保留、超时熔断、迁移安全 |
| 高可用与运维 | 单点、扩容、多副本状态、监控指标、日志追踪、备份恢复、发布回滚、CI/CD、测试体系 |
| 商业产品能力 | 租户生命周期、计费配额、OTA、开放 API、账号自助、通知渠道、视频、审计导出、国际化 |

### 3.2 方法

- 四域并行静态追踪：Controller → Service → Mapper/XML → 配置 → Compose/Nginx/CI → 文档，逐条对照。
- 对关键结论做定点复现：使用与项目相同的 JSQLParser 5.0 对数据范围 SQL 生成结果做隔离探针；核对 Spring Boot 3.3 下 `CommonErrorHandler` 的装配行为；核对依赖与配置的实际生效值。
- 对“文档声称有、代码没有”的能力逐项给出双方证据（见第 8 节）。
- 所有结论标注“已核实（代码/配置）”或“推断”；未执行端到端请求、未连接中间件、未做压测/漏洞扫描。

### 3.3 限制

- 本次审查期间仓库刚完成上一轮整改提交，整改记录自述 `mvn compile`、单元测试与前端构建通过；受本机沙箱限制（Maven 无法写 `~/.m2` 锁文件），**本次未能独立复跑完整构建与测试**，该结论按“未独立复验”处理。
- 未验证运行期行为：`docker compose config` 实际渲染、Spring 空环境变量覆盖默认值、Nginx 413、Redis 密码与健康检查冲突等，均以配置与框架默认值推断。
- 未做 CVE 比对、许可证扫描、性能压测、GB28181/ZLMediaKit 并发测试与渗透测试。

## 4. 上一轮 14 项整改复核

截至 `f14433b`，AUD-001~014 均已提交并推送。逐项静态复核如下；带“残留”的项在新发现中有对应编号。

| 编号 | 结论 | 复核证据与残留 |
| --- | --- | --- |
| AUD-001 | 已修复 | 网关/系统在公钥或私钥缺失、损坏时拒绝启动，未验签分支已删除。**残留**：开发默认私钥仍提交在仓库，且默认部署跑 dev Profile（P0-01） |
| AUD-002 | 已修复 | JWT/AppKey/白名单入口统一清理 12 个内部身份头后重建。**残留**：直连 Connector 仍信任 `X-User-Id` 等头（P0-03） |
| AUD-003 | 已修复 | 权限切面改为 fail-closed，无本地检查器时回退 Redis 权限集合。**残留**：权限缓存 TTL 提升到 12h，用户禁用/改密不清理（P1-03） |
| AUD-004 | 部分修复 | 网关拒绝 `/api/v1/internal/`、内部接口加共享令牌、业务服务端口收回内网。**残留**：Connector 9070 仍对外且零鉴权；内部令牌为静态全局密钥（P0-03、P1-10） |
| AUD-005 | 已修复 | 撤销判断收敛为单元素流，拒绝分支不再回落转发 |
| AUD-006 | 已修复 | 规则/告警/流转表达式统一改为只读 `SimpleEvaluationContext`，`message` 改为字段白名单 |
| AUD-007 | 已修复 | 包名改为 `dataforward/executor`，`.gitignore` 精确限定 `/target/`、`/*/target/`，源码已跟踪 |
| AUD-008 | 已修复 | MQTT/AMQP 缓存键含 `tenantId` 与凭据 SHA-256，凭据变更关闭旧连接。**残留**：单机 `ConcurrentHashMap`，多节点各自建连（P1-12 备注） |
| AUD-009 | 已修复 | `ParenthesedExpressionList` + OR 整体分组；隔离探针输出 `project_id IN (10, 20)`、`tenant_id = 1 AND (project_id IN (10, 20) OR id IN (20))`。新增 `DataScopeInterceptorTest`。**残留**：未在 PostgreSQL 实跑（P1-19 验收范围） |
| AUD-010 | 已修复 | GROUP 范围只收集组内设备，不再扩散到项目/产品 |
| AUD-011 | 已修复 | 详情/修改/启停/删除/密钥统一走 `getActiveDevice → assertDeviceInScope`。**残留**：无越权回归用例；内部调用依赖共享令牌 |
| AUD-012 | 已修复 | 导入改为 `ImportTaskDispatcher` 独立线程池。**残留**：队列纯内存，重启丢任务、队列满后任务永久 PENDING（P1-26） |
| AUD-013 | 已修复（device） | 消费者上抛 + 3 次重试 + `<topic>.dlt` + `message_id` 幂等。**残留**：rule/connector 消费者仍吞异常（P1-11） |
| AUD-014 | 已修复 | 三元组导出改异步任务、物模型参数导入改后端解析，前端已无 `XLSX.read`。**残留**：导出密钥无独立审计（P1-01、P1-08） |

> 复核意见：上一轮整改的质量整体较好，尤其 AUD-009 的 SQL 分组、AUD-013 的幂等与 DLT 设计。但整改记录中的“mvn compile 通过”未在本次环境复验；且 `V28` 非并发唯一索引、`.dlt` 无重投工具等交付细节仍需在联调环境验证。

## 5. P0：阻断商用的问题

### P0-01 默认部署身份可被离线伪造

**证据**

- 开发默认私钥完整提交在仓库：[application.yml](../../firefly-system/src/main/resources/application.yml#L79)；配对公钥在 [gateway application.yml](../../firefly-gateway/src/main/resources/application.yml#L141)。
- 所有服务开发默认内部令牌为 `firefly-internal-dev`（system/device/rule/data/support/media/connector/gateway 各 `application.yml`）。
- AppKey 密文加密密钥默认 `0123456789abcdef0123456789abcdef`：[application.yml](../../firefly-system/src/main/resources/application.yml#L87)。
- 生产 Compose 默认以 dev Profile 启动：`SPRING_PROFILES_ACTIVE: ${DEPLOY_ENV:-dev}`：[docker-compose.prod.yml](../../deploy/docker-compose.prod.yml#L16)；`.env.example` 默认 `DEPLOY_ENV=dev`。
- `deploy.sh` 不做任何密钥预检；README 一键部署仍是 `cp .env.example .env && bash deploy.sh up`。

**影响**：任何拿到源码的人都可用内置私钥签发任意 `sub`（例如种子超管，通常是 `1`）的 RS256 Token，通过网关验签并访问全部 API；同时可用默认内部令牌调用所有 `/api/v1/internal/**`，用默认 AppKey 密钥解密租户集成凭据。若客户或集成商按默认模板部署，平台在公网等同于无认证。整改记录虽声明“生产必须显式配置”，但默认路径仍以 dev 配置运行。

**处置**：删除仓库内所有默认私钥/令牌/加密密钥，改为启动时强制校验并由 KMS/Secret 注入；`deploy.sh` 增加 preflight，生产缺密钥、口令仍为默认值、`DEPLOY_ENV!=prod` 时直接拒绝；README 一键部署改为“先生成密钥再部署”。

### P0-02 中间件默认弱口令且端口直接发布，入口无 TLS

**证据**

- PostgreSQL `5432:5432`、密码默认 `firefly123`（[docker-compose.prod.yml](../../deploy/docker-compose.prod.yml#L60)、[:64](../../deploy/docker-compose.prod.yml#L64)）；Redis `6379:6379`、`--requirepass "${REDIS_PASSWORD:-}"` 默认为空（[:81](../../deploy/docker-compose.prod.yml#L81)）；Kafka `PLAINTEXT` + `9092:9092`（[:104](../../deploy/docker-compose.prod.yml#L104)、[:116](../../deploy/docker-compose.prod.yml#L116)）；Nacos `NACOS_AUTH_ENABLE: "false"` + `8848:8848`（[:134](../../deploy/docker-compose.prod.yml#L134)）；MinIO `minioadmin/minioadmin123` + `9000/9001`（[:153-158](../../deploy/docker-compose.prod.yml#L153-L158)）；Sentinel 无认证 `8858`；ZLM API `18080` 与默认 secret。
- Redis 同时保存 Token 黑名单、撤销时间戳、OpenAPI 限流计数、MQTT 路由与**被业务服务信任的权限集合** `perm:user:<id>`（[SecurityAspect.java](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/security/SecurityAspect.java)）。
- Nginx 只监听 80，无 TLS、HSTS、安全头：[default.conf](../../deploy/nginx/default.conf)。

**影响**：默认部署下，攻击者可直接读走全部租户数据（含 bcrypt、设备密钥、AppKey 密文）、向 Redis 写入 `perm:user:*` 把任意账号提权、覆盖 MinIO 固件、改 Nacos 配置；客户安全评审必然不通过。Redis 的 `allkeys-lru` 还会在内存压力下随机驱逐安全键（P1-14）。

**处置**：基础设施端口默认不发布或仅绑 `127.0.0.1`；强制随机强口令并在启动时校验；Nacos 开鉴权、Kafka 上 SASL/TLS、Redis ACL；入口统一 443 + TLS；Redis 健康检查带密码；安全类键与缓存键分实例。

### P0-03 Connector 管理面零鉴权且对公网开放

**证据**

- `9070:9070`、`1883:1883`、`5683/udp` 发布到宿主机：[docker-compose.prod.yml](../../deploy/docker-compose.prod.yml#L358)。
- Connector 全模块 `@RequiresLogin`/`@RequiresPermission` 数量为 **0**（本次 grep 复核）。
- 管理接口示例：TCP/UDP 会话枚举与 `DELETE` 断连、WebSocket `/send` 与 `/broadcast`；且 Connector 组件扫描 `com.songhg.firefly.iot.common`，包含信任 `X-User-Id`/`X-Tenant-Id`/`X-Granted-Permissions` 的 `WebContextInterceptor`。
- 内部接口拦截器只覆盖 `/api/v1/internal/**`，Connector 的管理控制器不在该路径下。

**影响**：不经网关即可匿名枚举并断开任意设备连接、向任意会话下发消息、全网广播；配合伪造上下文头，还能让下游逻辑以任意用户/租户身份执行。这是互联网可直接利用的未授权访问，不是“内网风险”。

**处置**：9070 只绑内网或改为仅经网关访问；Connector 管理接口补权限注解；入口统一服务令牌或网关鉴权；`WebContextInterceptor` 仅在可信入口启用；对 `internal` 与协议管理路径做白名单。

### P0-04 单机单实例，无备份、无容灾，无法承诺 SLA

**证据**

- 全部组件单实例：PG/Redis/Kafka/Nacos/MinIO/Sentinel/ZLM/8 个业务服务/Web 均无副本，Kafka `OFFSETS_TOPIC_REPLICATION_FACTOR: 1`、`TRANSACTION_STATE_LOG_MIN_ISR: 1`。
- 仓库无 Helm/K8s/HPA 清单；Compose 只有 `restart: unless-stopped`。
- 无 `pg_dump`/`pg_basebackup`/`mc mirror`/Velero 等备份脚本；`deploy.sh clean` 可直接 `down -v` 删除全部持久卷。
- 业务服务发布用一条 `docker compose up -d` 同时重建，发布窗口即全站中断。

**影响**：宿主机磁盘故障、误删卷、错误迁移均导致客户数据永久丢失；无法给出 RTO/RPO；无法做灰度发布、故障演练与容量横向扩展。付费客户最基础的“可用性”和“可恢复性”无法满足。

**处置**：明确两条交付线——单机版如实标注“不承诺 SLA / 仅开发验证”；生产版提供 K8s（Helm）或至少主从 + 备份方案。补 PG 全量+WAL/PITR、MinIO 异地镜像、Kafka 3 副本 RF=3、Redis Sentinel/Cluster；`clean` 增加备份硬门禁；发布改分批+健康校验+自动回滚。

### P0-05 OTA 只有元数据外壳，实际不可用

**证据**

- `createOtaTask` 只插入 `ota_tasks`，`totalCount` 固定 0：[OtaService.java](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/OtaService.java#L158)。
- 全仓无 `ota_task_devices` 的 INSERT（只有取消时的 UPDATE），任务不展开设备、不选择目标。
- 没有向设备下发升级指令的代码；`OTA_PROGRESS` 只写事件/平台事件，不回写任务或设备状态。
- 固件“验证/发布”只改状态，不校验 `md5Checksum` 或签名；无灰度分批、断点续传、失败重试、回滚、升级报表；不校验固件与产品/型号兼容。

**影响**：前端“全量/灰度”按钮点完没有任何设备升级，任务永远 PENDING、进度永远 0；若合同包含 OTA（工业/能源/车载场景几乎必含），验收直接失败。

**处置**：补齐任务-设备明细、按产品/标签/设备展开、分批灰度、下行指令、进度幂等回写与超时置败；固件 md5/签名与型号兼容校验；断点续传与回滚；任务报表。

### P0-06 无计费、无配额、用量数据无人写入（SaaS 模式）

**证据**

- `V38__remove_tenant_plan_and_quota.sql` 删除 `tenants.plan` 与 `tenant_quotas`；设计文档明确移除套餐配额。
- `tenant_usage_realtime` / `tenant_usage_daily` 只有读取代码（[TenantService.java](../../firefly-system/src/main/java/com/songhg/firefly/iot/system/service/TenantService.java#L232)），全仓无写入；租户页“用量”恒为 0 或旧值。
- 无账单/订单/支付/续费/欠费停服；普通 API、设备连接、消息速率均无限流（仅 OpenAPI 有日限/并发限制）。
- `Tenant.expireAt` 有字段但无接口写入、不参与登录/网关/设备认证。

**影响**：无法按设备数/消息数/存储/API/视频路数售卖套餐，无法试用转付费、续费、超量计费与欠费停服。若商业模式是私有化 license，本条可降为 P1（仍需 license 校验），但“用量”页面必须是真实数据。

**处置**：先确定商业模式；SaaS 需重建 plan+quota、五类计量写入与日聚合、入口超限拦截、账单与试用期；license 模式需签名 license 校验与到期停服；无论哪种都要让用量数据真实可查。

## 6. P1：上线前必修

### 6.1 身份与数据安全

| 编号 | 问题 | 证据 | 影响与处置 |
| --- | --- | --- | --- |
| P1-01 | 设备/产品密钥明文存库、非恒定时间比较，低权限即可读取与批量导出 | `Device.deviceSecret`、`Product.productSecret` 明文；`equals` 比较；`GET /devices/{id}/secret` 仅要求 `device:read`；导出含密钥且无审计 | 只读用户可成规模接管设备；改 HMAC/Argon2 或 KMS 信封加密、`MessageDigest.isEqual`、独立 `device:credential:read` + 二次确认 + 强制审计 |
| P1-02 | MQTT 无 TLS、无双向认证，设备口令明文过网 | MQTT 仅 1883、`allowAnonymous=false` 但无 SSL/证书配置；口令即 deviceSecret | 现场/公网可嗅探重放，伪造任意设备；仅开 8883 + TLS1.2/1.3 + x.509 双向认证 + 证书吊销/轮换 |
| P1-03 | 禁用/删除用户、改密不撤销会话；refresh 不校验用户/租户状态；权限缓存 12h | `updateUserStatus`/`deleteUser`/`resetPassword` 只改状态；`refreshToken` 无状态校验；`PermissionService` L1 5min + Redis 12h | 离职/封禁后旧 Token 最长 2h 可用、refresh 可续 30 天；状态变更统一 `kickSession + revoke_before`，refresh 校验状态与 `passwordChangedAt>iat` |
| P1-04 | 无密码强度策略、新用户默认密码可预测、无 MFA | 默认密码 `"Ffly@" + currentTimeMillis()%100000`；`needChangePassword=false`；密码策略仅存系统设置表且无引用；`ChangePasswordDTO` 仅 `@NotBlank` | 弱口令与“新建账号被抢登”；统一策略 + 随机初始密码 + 首登改密；超管/租户管理员强制 TOTP |
| P1-05 | 短信验证码可无限尝试、随机源弱；密码锁定可被用于 DoS | 失败不计数、成功才删码；`Math.random()`；5 次失败置 `LOCKED` 且无自动解锁 | 6 位码可爆破接管账号；错误密码可永久锁死任意账号；失败计数+一次性消费+`SecureRandom`+滑动限流+临时锁定 |
| P1-06 | 文件接口越权：`/upload/bytes` 无权限注解，对象名/类型可控，预签名/删除不校验归属 | [FileController.java](../../firefly-support/src/main/java/com/songhg/firefly/iot/support/controller/FileController.java#L71)；无扩展名/大小/内容校验 | 可覆盖他人租户固件/图片、写 `text/html` 造成存储型 XSS；全部加权限 + 服务端生成对象名 + 租户前缀校验 + 类型/大小白名单 + 病毒扫描 |
| P1-07 | SSRF：数据流转 Webhook 与通知 Webhook 目标不受限 | `WebhookForwardExecutor` 直接 `URI.create(url)` 后发送；`NotificationSender` 仅校验 URI 可解析 | 租户可让 rule/support 访问云元数据、Nacos/PG/Redis 内网；禁私网/环回/链路本地、禁重定向、出站代理白名单 |
| P1-08 | 审计能力实际未启用：`@Auditable` 全仓 0 处使用，操作日志只覆盖 system 控制器 | `AuditLogAspect` 切 `@Auditable`，但无任何方法标注；设备密钥查看/导出、OTA 发布、规则/流转变更、Connector 会话操作均无审计 | 安全事件无法溯源、无法定责；审计切面下沉 common 覆盖全部服务，对密钥/OTA/权限/删除/导出强制留痕，append-only + 哈希链 |
| P1-09 | LoRaWAN Webhook 无认证且被网关白名单直通 | `/CONNECTOR/api/v1/lorawan/webhook` 在白名单；`/webhook/up`、`/webhook/join`、`/webhook/ack` 无签名/令牌校验；`apiToken` 定义未使用 | 任何人可伪造任意 `devEui` 上行/入网，注入数据并触发规则/告警；校验签名或 token（恒定时间）+ 限流 + 未注册 devEui 拒绝 |
| P1-10 | 密钥/令牌生命周期缺失：JWT 无 `kid`/轮换/`iss`/`aud`，JWKS 非标准；内部令牌静态全局、非恒定时间 | `JwtService` 签发无 `kid`；`jwks.json` 返回自定义结构；网关单公钥；`InternalAccessInterceptor` 用 `equals`；Feign 对所有调用注入同一令牌 | 密钥泄露无法并行吊销、轮换需全量停机；内部任一服务被拿下即可横向访问全部内部接口；加 `kid`+标准 JWKS+双密钥并存，内部改服务身份（mTLS/Client Credentials） |

### 6.2 消息与数据可靠性

| 编号 | 问题 | 证据 | 影响与处置 |
| --- | --- | --- | --- |
| P1-11 | rule/connector 消费者仍吞异常，DLT 只有 device 模块 | `RuleRuntimeConsumer`/`DataForwardConsumer`/`EventSubscriptionConsumer`/`MqttDownstreamConsumer` 均 catch 后正常返回；`KafkaConsumerErrorConfig` 仅 device | 告警漏报、规则/流转静默失败且 offset 前进，无重试/死信；统一 `CommonErrorHandler` + DLT，失败上抛，DLT 配重投工具与积压监控 |
| P1-12 | Kafka 单 broker + RF=1 + 自动建 topic + 默认 1 分区 + `earliest` + 无并发配置 | Compose `KAFKA_AUTO_CREATE_TOPICS_ENABLE:true`、RF=1、无 `KAFKA_NUM_PARTITIONS`；所有 `@KafkaListener` 无 `concurrency`；`auto-offset-reset: earliest`；生产端无 acks/幂等/事务 | broker 或磁盘故障即丢失全部未消费消息；扩副本不提升吞吐；新消费组重放 7 天，重复告警/覆盖影子；3 broker + RF=3 + 预建 topic + 生产端 `acks=all`/幂等 + outbox |
| P1-13 | 下行指令无可靠投递：离线即丢、Broker 无持久化、跨节点用 Pub/Sub | 无路由 `log.debug` 后返回；`internalPublish` 无订阅者也返回 true；`persistence-enabled:false`；Redis `convertAndSend`；QoS1 | 设备离线/路由过期/节点重启时控制指令静默丢失，无落库/无重投/无失败记录；下行落 outbox + 重连补发 + 幂等；开 Broker 持久化；relay 改 Redis Stream |
| P1-14 | 设备影子只在 Redis，无 TTL、非原子读改写，且与安全键共用 `allkeys-lru` | `device:shadow:*` 无过期；GET→INCR→HSET 多次往返；Redis `--maxmemory 256mb --maxmemory-policy allkeys-lru`，无 AOF | 活跃影子被淘汰后 desired 状态静默丢失；并发上报丢更新；Redis 重启后影子/版本清零；desired 落 DB 权威副本 + Lua 原子更新 + 安全键独立实例 |
| P1-15 | 告警副作用无幂等、通知无重试/死信，`alarm_records` 无唯一约束 | `findOpenRecord` 后 `createRecord`（check-then-insert）；通知逐渠道同步 Feign，异常只 log；表无“每规则每设备最多一条 OPEN”唯一索引 | 并发/重放双开告警、通知风暴；渠道故障时告警存在但无人收到；部分唯一索引 + `ON CONFLICT` + 通知 outbox + 重试/死信 |
| P1-16 | 遥测写入放大 + 保留清理逐行 DELETE + 降采样窗口缺口 | 一属性一行且每行复制整包 payload；每消息一次设备查询；`DELETE ... USING` 对每行 `NOT EXISTS`；`@Scheduled` 无锁；CAGG `start_offset 3 days`；行删后 chunk 仍留到 365 天 | 100 万条/天 ≈ 1000 万行/天，PG 单机不可持续；多副本重复全表扫描；停机超 3 天的降采样永久缺口；payload 单存 + 设备缓存 + `drop_chunks`/按块删除 + 分布式锁 + CAGG 补刷 |
| P1-17 | 超时与熔断基本缺位 | 12 个 Feign 客户端无 `connect/readTimeout`；网关无 `response-timeout`；Sentinel 只连 dashboard，无规则、无 `@SentinelResource` | 下游 hang 时消费线程被占满、网关连接/堆增长直至 OOM（512m 堆）；统一超时预算 + 仅幂等重试 + 熔断 + 线程隔离 |
| P1-18 | 遥测查询无上限 | `TelemetryQueryDTO.limit` 无默认值/无 `@Max`；XML 在 limit 为空时不拼 LIMIT | 一次请求可把单设备 90 天明细读进 512m 堆，OOM 或超时；强制时间窗 + 默认/最大条数 + 游标分页 |
| P1-19 | 迁移安全：V27 静默降级、V28 非并发唯一索引、镜像 `latest` | V27 扩展/建超表/CAGG 失败仅 `RAISE NOTICE`；V28 在启动期对千万行表建非 `CONCURRENTLY` 唯一索引；`timescale/timescaledb:latest-pg16`、`minio:latest` | 治理能力“启动成功但全部失效”；迁移期阻塞遥测写入；版本行为漂移；除扩展缺失外 fail-fast，大表索引拆独立迁移 `CONCURRENTLY`，镜像钉版本 |

### 6.3 高可用、可观测与交付

| 编号 | 问题 | 证据 | 影响与处置 |
| --- | --- | --- | --- |
| P1-20 | 无 Prometheus registry、无监控告警栈、无业务指标 | 全仓 `micrometer-registry-*` 依赖为 0；配置却暴露 `prometheus` 端点；仅 Connector 有少量 `MeterRegistry`；Compose 无 Prometheus/Grafana/Alertmanager | `/actuator/prometheus` 实际 404；故障只能 tail 日志；无法回答 SLA/积压/丢消息；补 registry + 在线数/TPS/失败率/延迟/积压 + 监控栈与告警规则 |
| P1-21 | 一键部署与生产 preflight 缺失 | README 三步部署；`.env.example` JWT 为空；prod Profile 下网关/system 因空密钥拒绝启动，`deploy.sh` 只校验文件存在与 `DEPLOY_ENV` 取值 | 默认模板在 dev 下以公开密钥运行，切 prod 直接启动失败且报错需读源码；preflight 校验密钥可解析、口令非默认、必填项齐全，并打印生成命令 |
| P1-22 | 上传链路默认 1MB 双限制 | Nginx 无 `client_max_body_size`（默认 1m）；Spring 无 `spring.servlet.multipart.*`（默认 1MB）；固件/导入/导出都走反代 | OTA 固件通常数 MB~数百 MB，首次上传即 413；按业务上限配置，大文件改 MinIO 预签名直传 |
| P1-23 | CI/CD 只有编译+单测：无 SAST/依赖漏洞/镜像扫描/签名/SBOM/覆盖率；GitLab 发布与 Compose 定义矛盾 | `.github/workflows/ci.yml` 无 lint/trivy/cosign；无 jacoco；`.gitlab-ci.yml` 对只有 `build:` 的 prod Compose 执行 `pull` + `--no-build`；tag 直接 SSH 生产、无部署后验证/自动回滚 | 无法过供应链与发布审计；无法回答“生产跑哪个 commit”；GitLab 用户发布必失败；补扫描/签名/SBOM/覆盖率门禁 + 灰度回滚 + `git-commit-id` |
| P1-24 | 测试体系与商用不匹配：50 个测试文件/901 个主源码（约 5.5%），gateway/data 零测试 | `firefly-gateway/src/test`、`firefly-data/src/test` 不存在；无 `@SpringBootTest`/MockMvc/Testcontainers；无压测/混沌资产 | 鉴权、租户隔离、规则引擎、计费无回归保护；补核心链路集成测试（Testcontainers）、契约测试、k6 压测与故障演练 |
| P1-25 | 无备份/恢复/容灾脚本与演练 | 全仓无 `pg_dump`/`pg_basebackup`/`mc mirror`；运维文档无备份恢复章节；`clean` 直接删卷；5 套 Flyway 历史无 undo | 一次误操作即客户数据永久丢失；补每日全量+WAL/PITR、对象存储镜像、恢复演练与 RPO/RTO 文档；`clean` 加强制备份门禁 |
| P1-26 | 定时任务/采集器是节点本地状态，无分布式锁/选主 | `ScheduledTaskService` 内存 Map + `@PostConstruct` 注册；Modbus/SNMP 采集任务在内存；`TelemetryRetentionJob`/`ApiStatsAggregationTask` 无锁 `@Scheduled`；Redisson 只在父 POM 管理版本 | 多副本重复执行/重复通知；扩缩容后采集任务随机静默失效；引入分布式调度/锁 + 持久化任务 + 失败接管 |
| P1-27 | 多副本只有 MQTT 下行成立，WS/TCP/UDP/LoRa 下行会静默丢消息 | 下行单监听器；非 MQTT 通道查本机会话表，查不到仅 debug 后提交 offset；跨节点 relay 只覆盖 MQTT | 按 README 起 2 个 connector 后，非 MQTT 设备下行随机丢失且无错误；文档明确限制，或为所有传输建统一会话路由；投递失败必须上抛 |
| P1-28 | 健康检查/优雅停机/分批发布缺失 | Dockerfile 仅 `/actuator/health`（聚合依赖，抖动即 unhealthy）；无 liveness/readiness；无 `server.shutdown=graceful`/`stop_grace_period`；`deploy.sh up` 一次重建全部服务 | 发布窗口全站中断；依赖抖动误判；设备重连风暴；拆分探针 + 优雅停机 + 按依赖顺序分批发布 |

### 6.4 商业产品能力

| 编号 | 问题 | 证据 | 影响与处置 |
| --- | --- | --- | --- |
| P1-29 | 租户到期/停用不闭环 | `Tenant.expireAt` 有字段但无接口写入、VO 不返回；登录只校验状态，网关/设备认证不校验租户；停用只改状态+清缓存，不踢会话；注销直接软删 | 到期/欠费后旧 Token 仍可调 API、设备仍可连入写数据；到期时间可写可展示 + 登录/网关/设备认证按缓存校验 + 停用踢会话 + 注销冷静期与数据导出 |
| P1-30 | 隔离级别名不副实 | 页面可选 `SHARED_RLS`/独立 Schema/独立库，但只写 `isolation_level` 字段；无 `CREATE SCHEMA`、无数据源路由、无 PostgreSQL RLS；实际全靠 `tenant_id` 拦截器 | 客户选“独立 Schema/独立库”后仍同库同表，属合同/合规风险；短期移除未实现选项并明确共享库口径，中期实现 schema/独立库开通与路由 |
| P1-31 | 开放 API 仅 1 个接口，无 SDK/幂等 | 全仓仅 `ProductController` 一处 `@OpenApi`（按 ProductKey 取物模型）；设备 CRUD/遥测/属性设置/命令/告警均未开放；写接口无 Idempotency-Key | 集成商无法自助对接，每个项目定制开发；至少开放 10~15 个标准接口 + OpenAPI 文档 + SDK/Postman + 写接口幂等 |
| P1-32 | 无自助注册/邀请/忘记密码/MFA；短信登录实际不可用 | `sendSmsCode` 只 `log.info`，未调用任何短信网关；验证码用 `Math.random()`；无注册/邀请/重置流程 | 新客户必须平台人工建租户；忘记密码只能找运维；短信登录不可用；补邀请+激活、忘记密码 token、TOTP、短信网关 |
| P1-33 | 通知渠道交付弱：钉钉签名错误、无短信网关、无重试/回执 | 钉钉 `secret` 只加自定义 header `X-DingTalk-Sign-Secret`，未按钉钉要求生成 `timestamp+sign` 查询参数；SMS/PHONE 只 POST 自定义 `apiUrl`；失败只落 FAILED，`retryCount` 固定 0；无送达回执 | 按文档配置钉钉机器人会校验失败；短信需自建网关；告警漏发无补偿；补主流云 SMS 适配、正确签名与回执、失败重试+死信、模板审核 |
| P1-34 | 合规与交付物缺失 | 仓库无 `LICENSE`/`NOTICE`/SBOM；无 SLA/支持流程/等保/GDPR 材料；审计日志无导出/防篡改；租户注销无数据删除/导出 API；无第三方许可证扫描 | 采购/安全/法务评审缺材料；客户退出时数据无法带走/删除；补 LICENSE+SBOM+安全扫描、SLA/支持手册、审计导出与哈希链、数据导出与彻底删除 |

## 7. P2/P3 汇总

| 编号 | 级别 | 问题 | 证据/说明 |
| --- | --- | --- | --- |
| P2-01 | P2 | `X-Forwarded-For` 可伪造，绕过 OpenAPI IP 白名单与来源审计 | 网关取首段 XFF 直接作为 AppKey 鉴权与登录日志 IP；网关 8080 直接对外；仅信任受控代理并覆盖写 XFF，网关只允许 Nginx 访问 |
| P2-02 | P2 | MinIO 返回“公开 URL”，但 Bucket 未配置公开读策略；预签名 URL 固定 7 天 | `getObjectUrl` 拼 `endpoint/bucket/object`；上传返回该 URL；若 Bucket 私有则文件 404，若公开则固件/导出/快照可被匿名下载；统一私有 Bucket + 短 TTL 预签名 + 租户前缀校验 |
| P2-03 | P2 | `device_events` 无分区/保留，每条上下线/服务回复/OTA 进度写一行 | 与 `device_telemetry` 的治理不一致，长期无限增长；按时间分区 + 保留策略 |
| P2-04 | P2 | 视频无历史回放/录像检索下载；无并发路数配额；ZLM 单实例 | 只有实时点播/PTZ/抓拍/录像开关；设计文档声称有回放，实际无接口；补回放 INVITE/录像检索与租户并发配额 |
| P2-05 | P2 | 看板固定 5 个接口，无自定义看板/保存分析 | 客户无法按角色定制运营大屏；支持可配置看板与分享 |
| P2-06 | P2 | 无企业 SSO：仅微信/钉钉/支付宝/Apple，无 OIDC/SAML/LDAP/AD | 大型企业统一身份接入需定制；补 OIDC/SAML 元数据配置与 JIT provisioning |
| P2-07 | P2 | 仅中文、无时区配置；Token 存 localStorage；无前端测试 | 海外客户不可用；XSS 可窃取 Token；补 i18n、租户时区、HttpOnly Cookie 或内存 Token |
| P2-08 | P2 | Docker 以 root 运行、镜像 `latest`、容器日志无轮转上限 | Dockerfile 无 `USER`；`timescaledb:latest-pg16`、`minio:latest`；Compose 无 `logging.options`；非 root + 钉版本 + 日志轮转 |
| P2-09 | P2 | 生产未关闭 springdoc，`/v3/api-docs`、Swagger UI 默认开启 | 业务端口已收内网，风险降低，但仍属不必要暴露；prod Profile 关闭或加权限 |
| P2-10 | P2 | 无 CORS 配置、Nginx 无安全头（CSP/HSTS/X-Frame-Options） | 同源部署下暂不构成风险，跨域部署会失效，且不满足安全基线；补白名单 CORS 与安全头 |
| P2-11 | P2 | 版本与制品不可追溯：`1.0.0-SNAPSHOT`、无 build-info/git-commit-id、无 tag | 无法回答生产跑哪个 commit；补 SemVer、git-commit-id、镜像 sha+tag |
| P2-12 | P2 | 规则动作仅 5 类（DB_WRITE/KAFKA_FORWARD/WEBHOOK/EMAIL/SMS/DEVICE_COMMAND），无窗口聚合/延迟；告警无去重/抑制/静默/升级 | 复杂场景需外部系统补；补告警去重窗口、静默期、未确认升级、值班派单 |

## 8. 文档与实现不一致

| 文档声称 | 实现现状 | 影响 |
| --- | --- | --- |
| `docs/design/product-design.md` 写生产 `mqtt.replicas:3`、`api.replicas:2`、PG 2 副本、Redis 6 节点、Kafka 3 副本、HPA，以及 Prometheus+Grafana+Alertmanager 指标/告警 | 仓库只有单机 Compose，无 K8s/Helm、无副本、无 metrics registry、无监控栈 | 售前/架构评审引用该文档会构成虚假承诺；应改写为“规划中”或补齐实现 |
| README “一键部署”三步 | 默认 `.env` 是 dev + 空 JWT 密钥；dev 下用仓库内置密钥启动，切 prod 因空密钥直接启动失败，`deploy.sh` 无预检 | 客户首次部署要么不安全、要么失败；需在文档与脚本中把“生成密钥”作为前置步骤 |
| README/ARCHITECTURE 的多实例扩容说明只覆盖 MQTT | WS/TCP/UDP/LoRa 下行依赖本机会话表，多副本会丢消息 | 客户按文档扩容后非 MQTT 设备控制随机失效 |
| `docs/operations/docker-compose-deployment.md` 仍写宿主机可访问 `http://localhost:9030/actuator/health`、部署等待 Rule 入口 | `docker-compose.prod.yml` 已不发布 9030，`deploy.sh` 已移除 Rule 健康检查 | 运维按文档排查会得到“连接拒绝”的误导结论 |
| `detailed-design-ota-upgrade.md` 描述完整 OTA 流程 | 只有固件 CRUD + 任务元数据，无设备展开/下发/进度回写 | 需求方会按“已实现”验收 |
| 租户隔离级别 `SHARED_RLS` 等 | 无 RLS/Schema/独立库实现，只有 `tenant_id` 拦截器 | 合规评审与合同条款风险 |
| 租户页“用量” | `tenant_usage_*` 无写入 | 演示数据全 0，削弱专业度 |

## 9. 整改顺序建议

| 阶段 | 范围 | 退出条件 |
| --- | --- | --- |
| 阶段 A：安全闸门（1~2 周量级） | P0-01、P0-02、P0-03；P1-01、P1-03、P1-04、P1-08 | 删除仓库默认密钥与内部令牌；默认部署只绑内网且无默认口令；Connector 管理接口需鉴权；无凭据直连 5432/6379/9092/9070 全部失败；账号禁用/改密立即失效；审计覆盖密钥/OTA/权限变更 |
| 阶段 B：可靠性与运维底座 | P0-04、P1-11~P1-19、P1-20~P1-28 | 3 副本 Kafka + DLT 全链路 + 下行可重投 + 影子权威副本；监控/告警/备份/恢复演练/优雅停机/分批发布可演示；CI 有扫描、覆盖率与回滚 |
| 阶段 C：商业能力闭环 | P0-05、P0-06、P1-29~P1-34 | OTA 端到端升级成功并可回滚；计量/配额/账单或 license 生效；租户到期停服；开放 API、通知、审计导出与数据删除可用 |
| 阶段 D：规模化与合规 | P2 全部 + 行业适配 | 通过压测、渗透测试、备份恢复演练与客户安全评审 |

阶段 A 完成前不建议对外演示“生产部署”；阶段 B 完成前不建议签 SLA；阶段 C 完成前不建议把 OTA/套餐/开放平台写进合同。

## 10. 未核实项

- 完整构建与测试：本机沙箱无法运行 Maven（`~/.m2` 锁文件不可写），整改记录中的 `mvn compile`、单测、前端构建结论未独立复验。
- 运行期行为：Compose 渲染、空环境变量覆盖、Nginx 413、Redis 密码与健康检查冲突、Spring 健康检查聚合行为，均为配置/框架默认值推断。
- 安全：未做 CVE 比对、依赖许可证扫描、渗透测试；未验证默认 Token 伪造在实际部署中是否被 Nginx/防火墙阻断。
- 性能：未做设备上行 TPS、API P99、Kafka 积压、时序查询、GB28181/ZLM 并发压测。
- 合规：未核对等保/GDPR/个保法条款，未核查第三方组件许可证。

## 11. 附录：关键证据

### 11.1 快照

- HEAD：`f14433ba6b0e5d383a86da8035250c957bda6f3e`（`master`，与 `origin/master` 一致）。
- 工作区：干净；上一轮整改提交包含 69 个文件、新增 5 个数据流转执行器源码与 2 个回归测试。

### 11.2 数据范围 SQL 隔离探针

使用项目依赖的 JSQLParser 5.0，对整改后的 `ParenthesedExpressionList` 组合做隔离渲染，输出：

```text
IN  => project_id IN (10, 20)
AND => tenant_id = 1 AND (project_id IN (10, 20) OR id IN (20))
```

与 `DataScopeInterceptorTest` 的断言一致，说明 AUD-009 的字符串生成已修正；仍建议在 PostgreSQL 上对 ALL/SELF/PROJECT/GROUP/CUSTOM 做执行级回归。

### 11.3 复核方法说明

本报告第 4 节为对 `f14433b` 的静态复核；第 5~7 节为新发现，证据均来自当前提交的代码、配置、Compose/Nginx/CI 与文档。所有“未找到”结论的检索范围为 `firefly-*/src`、`firefly-web/src`、`deploy`、`docs`（排除 `node_modules`、`target`）。

### 11.4 与上一轮报告的关系

上一轮报告记录 AUD-001~014 的原始证据与验收标准，本报告不重复展开；两项报告应一起阅读：上一轮回答“已有实现是否正确”，本报告回答“作为一个商用平台还缺什么”。
