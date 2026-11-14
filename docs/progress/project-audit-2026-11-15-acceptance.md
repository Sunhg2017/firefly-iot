# Firefly IoT 审计整改验收报告

## 1. 验收结论与版本边界

**结论：未通过。修复提交解决了多项原问题，但不能将 AUD-001～AUD-014 全部关闭。**

| 项目 | 内容 |
| --- | --- |
| 报告编号 | FIREFLY-ACCEPTANCE-20261115-01 |
| 验收日期 | 2026-11-15（Asia/Shanghai） |
| 验收依据 | [原审计报告](project-audit-2026-11-15.md)的 14 项发现及其验收标准 |
| 被验收整改记录 | [AUD-001～014 整改记录](project-audit-2026-11-15-remediation.md) |
| 固定测试基线 | `f14433ba6b0e5d383a86da8035250c957bda6f3e` |
| 构建方式 | `git archive` 导出已跟踪源码，在临时目录编译，排除工作区旧 class 与遗漏源码的干扰 |
| 后端结果 | 两组 Maven reactor 构建成功；去重后 177 个已有测试，0 失败、0 错误、0 跳过 |
| 前端结果 | 同一源码快照执行 `npm run build`，TypeScript 与 Vite 构建通过 |
| 专项结果 | 51 个验收断言：45 通过、6 失败；6 个失败覆盖 5 个原审计编号 |
| 本次变更范围 | 验收报告、原报告状态说明、文档索引及独立验收探针；不修改业务实现 |

验收期间仓库继续出现 `cf6e6fd`（另一份审计文档）、`f21db74`（设备认证、远程配置及批量操作）及 `d41b3c7`（连接器鉴权与统一 Kafka 重试/死信）。这些后续提交**没有被混入本次固定基线的构建和动态测试，也不因本报告而获得验收通过结论**。报告落盘前已对照 `d41b3c7` 的差异：本报告 6 个问题的关键实现仍保留；权限事件消费者增加了异常上抛，但仍只删除 Redis 集合，未改变 ACC-004 的缓存重建路径。统一 Kafka error handler 亦不能解决 ACC-002 中监听器正常返回的问题。此检查属于静态增量复核，不是对后续全部功能的完整验收。源码链接用于定位模块；精确复现应检出上述完整测试提交号，不能用不断变化的工作区替代基线。

本次确认 6 个残留或回归问题，其中 P1 4 项、P2 2 项。优先阻断项是跨项目读取设备密钥、规则消息发送失败仍正常结束消费、不同设备的遥测去重键冲突，以及权限缓存失效后合法用户被拒绝。

归档时另一项并行开发提交 `3c28efd83e4b0d8282b681526397dd8ddb2ce321` 收录了本报告、状态说明和探针，同时包含可观测性与 OTA 功能。已进一步静态对照该提交：相关消息类增加指标及 OTA 处理，未改变本报告确认的 6 处根因；后续功能未执行本报告中的动态验收。上述归档情况不改变固定测试基线。

## 2. 原 14 项逐项验收

“通过”仅表示本轮源码及隔离测试覆盖的原缺陷已关闭，不表示完成生产部署或外部依赖联调。“部分通过”表示主修复可见，但原验收条件仍缺少验证或实现；“未通过”表示存在可复现失败。

| 编号 | 结论 | 验证结果与未完成项 |
| --- | --- | --- |
| AUD-001 | 通过 | 公钥缺失、非法公钥阻止初始化；非法格式、过期、错误签名 JWT 均被拒绝；合法签名请求可转发。测试使用临时生成的 RSA 密钥。 |
| AUD-002 | 通过（代码级） | 合法 JWT 携带伪造 AppKey、权限、内部令牌头时，这些头被清理；白名单入口也清理内部身份头。AppKey 转发分支使用同一清理方法，已静态核对；完整 AppKey 签名授权联调尚未执行。 |
| AUD-003 | 未通过 | 无权限源、空 Redis 权限集合均拒绝访问，原放行已修复；但权限缓存失效后正常权限无法可靠恢复，见 ACC-004。 |
| AUD-004 | 通过（代码级） | 公共网关拒绝内部路径；内部拦截器拒绝缺失/错误令牌、接受正确令牌；签发接口拒绝错误租户、产品及超长 TTL，合法设备可签发。部署文件收回主要业务 HTTP 端口；真实部署网络和服务调用联调尚未执行。 |
| AUD-005 | 通过 | JWT 签发时间为 100，撤销标记不存在、为 50、为 200 时，转发次数分别为 1、1、0；最后一例返回 401，无重复转发。 |
| AUD-006 | 部分通过 | 规则、告警、流转模板的字段比较正常；三处均拒绝类型访问、构造器、实例方法调用。原 JVM 能力访问已关闭；未完成表达式复杂度与执行耗时边界验证，不能据此宣称资源消耗边界已验收。 |
| AUD-007 | 通过 | executor 目录源码已纳入 Git；只用提交快照完成 rule 及相关模块构建，原缺少执行器源码的问题未再出现。 |
| AUD-008 | 部分通过 | MQTT、AMQP 的缓存键均随租户和凭据改变，原缓存键复用问题已修复；旧连接淘汰和并发落败关闭分支存在。尚未执行真实 Broker 的错误凭据、凭据轮换、并发与连接失效测试。 |
| AUD-009 | 部分通过 | 原 SQL 的 `IN` 与 `OR` 分组缺陷在专项探针及新增单测中修复；生成结果见第 5 节。尚未连接 PostgreSQL 执行完整数据范围矩阵，不能将字符串断言视为数据库执行通过。 |
| AUD-010 | 通过 | 实际 GROUP 解析结果只包含授权设备，不再自动加入它所属的项目和产品。 |
| AUD-011 | 未通过 | 新增单设备校验仍会通过产品关系扩大 PROJECT 授权；同产品的其他项目设备密钥仍可读取，见 ACC-001。 |
| AUD-012 | 未通过（异步入口已修复） | 注册后先返回 taskId，实际文件访问在独立线程且带租户/用户上下文；但任务拒绝更新进度后仍继续执行，见 ACC-005。进程重启后的恢复/终止策略亦未验收。 |
| AUD-013 | 未通过 | 消费入口及核心写入异常能够上抛，已增加重试/死信配置；规则下游发送失败仍被吞掉，且新增去重键有跨设备冲突，见 ACC-002、ACC-003。事件、影子等成功步骤的重复副作用及死信重放未完成联调。 |
| AUD-014 | 未通过 | 三元组导出已改为任务注册、后台生成 CSV、上传 MinIO，列使用业务标识；参数清单导入仍直接同步下载和解析，见 ACC-006。实际任务文件下载未做 MinIO 联调。 |

汇总为：**6 项通过本轮代码级验收、3 项部分通过、5 项未通过。** 这些分类不能替代各行中明确列出的联调边界。

## 3. 已确认的残留与回归

### ACC-001 [P1] PROJECT 范围仍可跨项目读取同产品设备密钥

- 对应原项：AUD-011。
- 根因位置：[DatabaseDataScopeResolver.java:115](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/mybatis/scope/DatabaseDataScopeResolver.java#L115)、[DeviceService.java:1078](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java#L1078)。
- 受影响入口示例：[DeviceService.getDeviceSecret](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java#L352)。

PROJECT 解析会收集授权项目中设备所属的 `productIds`。新增单设备校验将“项目命中、产品命中、设备命中”以 OR 连接。产品关联因此变成了对其他项目设备的授权。设备列表的数据范围注解却明确设置 `productColumn = ""`，导致列表与详情/密钥读取的边界不一致。

**隔离复现：** 用户只授权项目 100，其中设备 10 属于产品 200。实际解析器返回 `projects=[100], products=[200], devices=[10]`。另一个设备 11 属于项目 101、产品 200。调用实际 `getDeviceSecret(11)` 未被拒绝；将设备 11 的产品改为 201 后才被拒绝。测试只使用合成密钥，没有读取真实设备凭据。

**影响：** 在同租户、同产品分布于多个项目时，拥有相应操作权限的用户可访问数据范围之外的设备。其他共用该检查的单对象操作也受到相同授权判断影响。

**重新验收条件：** 用一个统一的设备可访问谓词约束列表、详情、密钥读取和写操作；“为展示父对象而收集到产品”不能变成对子设备的授权。补齐 PROJECT、GROUP、SELF、混合角色的同产品异项目负例与授权设备正例。

### ACC-002 [P1] 规则引擎发送失败仍无法触发消费失败处理

- 对应原项：AUD-013。
- 根因位置：[DeviceMessageProducer.java:79](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceMessageProducer.java#L79)、[MessageRouterService.java](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/MessageRouterService.java)中的 `forwardToRuleEngine`。

虽然消费入口和遥测/影子写入已传播异常，但 `KafkaTemplate.send(...).whenComplete(...)` 的失败分支只记录日志，既没有把 future 交给调用者，也没有让消费链等待发送结果。路由层另外还捕获同步发送异常并只记录日志。

**隔离复现：** 将实际生产者使用的 `KafkaTemplate.send` 设置为已失败的 future，运行实际 `DeviceMessageProducer → MessageRouterService → DeviceMessageConsumer` 调用链。确认发送确实发生后，消费者仍正常返回。对照组中让路由器直接抛出异常，消费者则会向外抛出，说明失败并非测试框架遗漏。

**影响：** 规则消息可能未进入规则输入 topic，而监听容器没有收到失败信号；新增 error handler 无法据此触发重试或死信。该缺陷不是“所有 Kafka 消息都会丢失”，其触发条件是这一步发送失败。

**重新验收条件：** 明确持久化及规则转发的整体成功条件，采用可观察发送结果或持久投递记录；注入同步异常和异步 future 失败，验证不会报告整体成功，并验证重试不会重复触发已成功副作用。

### ACC-003 [P1] 新增遥测去重键未包含设备身份

- 对应原项：AUD-013，属于本次整改引入的回归。
- 根因位置：[V28__add_telemetry_message_id.sql:10](../../firefly-device/src/main/resources/db/migration/V28__add_telemetry_message_id.sql#L10)、[DeviceTelemetryMapper.xml:33](../../firefly-device/src/main/resources/mapper/device/DeviceTelemetryMapper.xml#L33)。
- 消息标识来源：[MessageCodec.java:51](../../firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/MessageCodec.java#L51)。

唯一索引仅包含 `(message_id, property, ts)`，未包含 `tenant_id` 或 `device_id`；插入语句遇冲突直接 `DO NOTHING`。但消息 ID 可来自设备上报的 `id`，现有入口没有保证它在不同设备之间全局唯一。

**隔离复现：** 两个不同设备在同一毫秒使用相同消息 ID `1` 上报 `temperature`。实际 `DeviceDataService` 生成两条设备 ID 不同、但上述唯一索引三列完全相同的记录。此处验证了记录生成与索引定义的冲突，**未在真实 PostgreSQL/TimescaleDB 中执行迁移或插入**；数据库静默舍弃冲突行的结论来自当前唯一索引及 `ON CONFLICT DO NOTHING` 的组合。

**影响：** 合法的不同设备上报在相同时间、属性和消息 ID 下会相互冲突；在该索引生效后，一条记录可能被当作重试而忽略。现有键也没有租户维度。

**重新验收条件：** 明确消息 ID 的唯一性域，在去重键中包含必要的租户/设备身份或建立可验证的全局标识。必须同时验证“同一设备同一消息重试只存一次”和“不同设备/租户相同局部消息 ID 均能保存”；在目标 TimescaleDB 结构上执行 Flyway 与插入验证。

### ACC-004 [P1] 权限缓存失效后合法用户被当作无权限

- 对应原项：AUD-003，原越权放行已关闭，但正常授权回归未通过。
- 根因位置：[SecurityAspect.java:90](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/security/SecurityAspect.java#L90)、[PermissionService.java:62](../../firefly-system/src/main/java/com/songhg/firefly/iot/system/service/PermissionService.java#L62)、[PermissionEventConsumer.java:50](../../firefly-system/src/main/java/com/songhg/firefly/iot/system/consumer/PermissionEventConsumer.java#L50)。

无本地 `PermissionChecker` 的业务服务直接把 Redis 集合作为权限来源，缓存未命中即拒绝。权限变更事件会删除该集合，却不重建它。system 的 L1 缓存命中又会提前返回，不保证 Redis 被补回。

**隔离复现：** 数据库 mock 保持用户拥有 `device:delete`。实际 `PermissionService` 首次查询填充缓存后，公共切面允许请求；执行实际权限事件消费者删除 Redis 权限集合，再调用 system 权限查询（此时 L1 命中），业务切面仍拒绝这个合法权限。模拟的是缓存失效与 L1 仍有效的组合，包括多实例/异步事件时序可能出现的状态，不声称每次角色修改都必然触发同一时序。

**影响：** 正常授权依赖 Redis 恰好被其他调用预热；权限变更、缓存逐出或过期后，业务服务缺少可靠恢复路径。把 TTL 延长到 12 小时只能推迟失效，不能修复这一依赖。

**重新验收条件：** 建立可信的缓存未命中查询/重建机制，明确 L1/L2 失效一致性；验证授权、撤权、多实例、Redis 集合不存在和过期场景。失败时仍须拒绝访问，不能恢复成原先“没有检查器就放行”。

### ACC-005 [P2] 导入线程忽略任务已结束/已取消信号

- 对应原项：AUD-012，异步注册本身已修复。
- 根因位置：[DeviceImportService.java:95](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceImportService.java#L95)、[DeviceImportService.java:133](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceImportService.java#L133)、[ThingModelImportService.java:97](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/ThingModelImportService.java#L97)。
- 状态契约：[AsyncTaskService.updateProgress](../../firefly-support/src/main/java/com/songhg/firefly/iot/support/service/AsyncTaskService.java#L123)。

任务中心对已完成/已取消任务返回 `false`，但设备与物模型导入不检查进度更新结果，也不在批次或模型写入前读取取消状态。

**隔离复现：** 将任务中心的 `updateProgress` 返回设置为 `R.ok(false)`，实际设备导入仍调用文件服务获取下载 URL。该探针验证了“任务拒绝继续后仍开始文件处理”，没有执行真实设备创建；后续批量写入缺少取消检查另由源码确认。

**影响：** 页面取消与执行线程的行为可能不一致。任务中心阻止最终状态被改回完成，并不意味着业务写入停止。进程崩溃后，当前内存任务如何恢复或明确终止也尚无验收证据。

**重新验收条件：** 已取消任务不再启动下载、解析或下一批写入；取消和提交之间的事务边界明确。补齐处理中取消、排队取消、执行器拒绝、进程重启后的状态与副作用验证。

### ACC-006 [P2] 参数清单导入仍在请求线程同步处理

- 对应原项：AUD-014。
- 根因位置：[ProductController.java:138](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/controller/ProductController.java#L138)、[ThingModelImportService.java:352](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/ThingModelImportService.java#L352)。

前端已不再直接解析 XLSX，但新接口 `/{id}/thing-model/parse-parameters` 直接下载并解析 CSV/Excel，再同步返回全部参数行。该调用没有注册任务、提交执行器或记录任务进度和失败日志。

**隔离复现：** 调用实际 `parseParameterRows`，文件服务在调用线程被访问；任务客户端和分发器调用次数均为 0。探针在文件 URL 边界停止，不读取真实文件。同步下载与解析的后续路径由源码核对。

**影响：** 仍违反仓库“所有导入导出走异步任务中心”的明确规则；仅把浏览器解析移到后端同步接口不满足验收。该问题也保留了大文件请求超时和大结果集响应的风险。

**重新验收条件：** 上传 MinIO 后注册参数导入/解析任务，返回 taskId；用户通过任务中心取得进度、失败详情和结果，取消及超时语义与其他任务保持一致。

## 4. 构建和测试记录

### 4.1 已有后端测试

固定快照中以项目要求的 JDK 21 执行：

```bash
JAVA_HOME=/path/to/jdk21 mvn -B -ntp -pl firefly-common,firefly-gateway,firefly-device,firefly-rule,firefly-system,firefly-support -am test -Dstyle.color=never
JAVA_HOME=/path/to/jdk21 mvn -B -ntp -pl firefly-connector,firefly-data,firefly-media -am test -Dstyle.color=never
```

| 模块 | 测试数 | 失败 / 错误 / 跳过 |
| --- | ---: | --- |
| common | 12 | 0 / 0 / 0 |
| system | 17 | 0 / 0 / 0 |
| device | 53 | 0 / 0 / 0 |
| rule | 34 | 0 / 0 / 0 |
| support | 1 | 0 / 0 / 0 |
| connector | 37 | 0 / 0 / 0 |
| media | 23 | 0 / 0 / 0 |
| 合计（common 在两组中只计一次） | **177** | **0 / 0 / 0** |

gateway、data、api、plugin-api 在相应 reactor 中参与构建，但没有可计入本表的已执行测试。不能用“构建成功”代替这些模块的行为测试。

环境处理：最初 Maven 受沙箱限制，无法写入本地依赖锁；获准后补齐了缺少的插件依赖。系统 Maven 默认 JVM 是 JDK 27，与项目要求的 JDK 21 不一致，出现 Lombok 初始化错误；显式指定已安装 JDK 21 后两组构建成功。这些环境错误未被计为项目缺陷。

### 4.2 前端

在同一 Git 源码快照的 `firefly-web` 目录运行 `npm run build`，结果成功，Vite 构建阶段耗时约 7.49 秒。依赖使用工作区现有 `node_modules`，未重新进行锁文件安装。因此结论是“当前依赖环境下的源码构建通过”，不是“全新机器的依赖安装已验证”。

### 4.3 独立专项探针

探针直接运行上述快照编译出的实际业务类，仅在 Redis、Mapper、Feign、Kafka 等外部依赖边界使用 mock，不替换被验收的授权、路由和服务逻辑。它不启动业务服务、不连接生产数据库、不访问真实 Broker，也不修改仓库业务实现。

- [完整探针源码](acceptance-2026-11-15/FireflyAcceptanceProbe.java)
- [运行脚本](acceptance-2026-11-15/run_probe.py)
- [逐项断言结果](acceptance-2026-11-15/probe-results.txt)

先将 `f14433ba6b0e5d383a86da8035250c957bda6f3e` 导出到独立目录并执行本节 Maven 命令，再运行：

```bash
python3 docs/progress/acceptance-2026-11-15/run_probe.py /path/to/built-f14433b-snapshot --java-home /path/to/jdk21
```

脚本读取快照的 Surefire classpath，并为没有独立测试输出的网关补入基线所用的 WebFlux/Gateway 依赖；可通过 `--m2` 指定 Maven 缓存目录。探针源码和脚本应从保存本报告的版本读取。**当前基线预期退出码为 1，原因是存在失败验收断言；编译错误或非预期异常不能作为同等复现结果。** 修复后预期应为全部对应断言通过。

## 5. 关键观察输出

```text
OBSERVATION project=[100] product=[200] device=[10]
OBSERVATION scopedSql=SELECT * FROM devices WHERE (status = 'ACTIVE' OR status = 'INACTIVE') AND (project_id IN (100) OR id IN (10))
FAIL AUD-011 other project same product secret denied
FAIL AUD-003 authorized user works after permission invalidation and system reread
FAIL AUD-012 worker stops when task progress update is rejected
FAIL AUD-013 downstream broker failure reaches listener container
FAIL AUD-013 telemetry dedup key distinguishes devices
OBSERVATION telemetry records=2 distinctDevices=true sameSqlUniqueKey=true
FAIL AUD-014 parameter import does not perform file I/O on request thread
OBSERVATION parameterImport callerThread=true taskRegistrations=0
SUMMARY passed=45 failed=6
```

已有单测全部通过与专项断言失败并不矛盾：当前测试覆盖并未包含这些跨组件时序、跨项目负例和去重唯一性场景。

## 6. 后续验收门槛及交付边界

1. 优先修复 ACC-001～ACC-004，并将对应负例纳入模块回归测试；修复成功路径后仍需保留拒绝路径的验证。
2. 完成 ACC-005、ACC-006，任务中心的状态必须约束真实执行行为，参数导入必须进入统一任务流程。
3. 对 AUD-006/008/009 补充资源消耗、真实 Broker 及 PostgreSQL 验证；对消息失败处理执行 Kafka 重试、死信、重放与成功步骤幂等验证；对任务执行取消、重启与文件下载验证。
4. 以一个明确、稳定的后续修复提交重新验收，不能把进行中的工作区变更与已测试快照混为同一版本。

本报告没有连接 PostgreSQL/TimescaleDB、Kafka、Redis、MinIO、MQTT/AMQP Broker，没有执行全栈部署、浏览器业务操作、并发压测或真实故障恢复。因此不声明生产可用、发布通过或完整安全认证。

本次只创建或修改验收文档及证据；它们在共享工作区被并行开发提交 `3c28efd` 一并收录，未重写该提交。随后仅补记本报告的实际归档与版本边界。由于 `master` 上还有包含已确认 P1 问题的未发布业务提交，直接推送该分支会连带发布这些提交，本次按仓库规则中的“存在明确发布风险”例外暂缓推送；最终提交号及分支状态在交付消息中记录。
