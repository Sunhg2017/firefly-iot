# Firefly IoT 设计与实现审计报告

## 1. 报告信息

| 项目 | 内容 |
| --- | --- |
| 报告编号 | FIREFLY-AUDIT-20261115-01 |
| 报告版本 | 1.0 |
| 生成日期 | 2026-11-15（Asia/Shanghai） |
| 审计对象 | Firefly IoT 平台的设计与实现 |
| 审计基线 | `d6ec5fa9da0a2abb6ebb90d9cc01bc37ab3edbed`，另包含审查时本地未跟踪的数据流转执行器源码 |
| 报告生成时 HEAD | `4799bc19397859c92a75ef2e84f47c018f1f63b0` |
| 报告性质 | 基于源码、配置和隔离验证的内部技术审计；不构成生产环境渗透测试或合规认证 |
| 问题状态 | 已提交整改，独立验收未通过；逐项状态见 [整改验收报告](project-audit-2026-11-15-acceptance.md)，不能按整改声明全部关闭 |

本报告将上一轮审查的证据和结论正式归档。**整改实施记录见 [project-audit-2026-11-15-remediation.md](project-audit-2026-11-15-remediation.md)。**审计基线之后新增的遥测数据治理功能属于提交 `4799bc1`，未纳入本报告的完整审计范围；报告生成时已复核两个版本间的改动清单与执行器文件的跟踪状态，没有据此宣称新版本已通过审计。

## 2. 执行摘要

共发现 **14 项问题：P1 13 项，P2 1 项**。主要风险是身份和权限可绕过、用户数据范围与租户连接边界不完整、失败消息缺少恢复路径，以及提交内容无法在干净环境重复构建。

多项结论已在当前实现的隔离探针中复现，包括：无检查器时权限放行、伪造权限上下文被信任、撤销 Token 后仍进入下游链路、规则表达式调用 JVM 方法、导入没有进入异步执行器、错误密码命中既有 Broker 连接。仅使用版本库跟踪的 rule 主源码编译时，确认缺少执行器类型。

**审计建议：在正式使用前优先完成全部 P1 整改，并通过对应回归验证。** 修复时应先统一信任和授权边界，再处理数据范围、异步与消息可靠性；不宜在存在这些缺陷时继续扩大功能范围。

这些发现跨越原有模块和新增数据流转模块，不能全部归因于最近一次功能提交。本报告未修改业务实现，也未验证整改后的效果。

## 3. 范围、方法与限制

### 3.1 审计范围

| 领域 | 核查内容 |
| --- | --- |
| 总体架构 | 模块职责、网关入口、服务间调用、部署边界 |
| 认证授权 | JWT、AppKey、可信请求头、接口权限检查器、内部接口 |
| 数据权限 | 租户过滤、项目与分组范围、列表和单对象操作的一致性 |
| 规则与流转 | 表达式求值、执行器连接缓存、版本管理与构建 |
| 设备消息 | 消费异常、持久化失败、后续处理和恢复能力 |
| 异步任务 | 设备与物模型导入调用链、任务状态与实际执行方式 |
| 前端交互 | 文件解析、导入导出任务流程、业务标识展示 |

### 3.2 审计方法

- 对照架构文档、应用配置、控制器、服务、切面、Mapper 和前端调用链进行静态追踪。
- 全仓库检索权限检查器实现、异步调用、异常处理与版本管理规则，确认实际装配和入口。
- 使用当前源码重新编译选定类，配合本地依赖、Mock 和无害探针验证具体行为。
- 只选择 Git 跟踪的 rule 主源码进行隔离编译，排除本地未跟踪源码对构建结果的掩盖。
- 在正式归档时校验引用路径，并保留复现输出摘要和本地证据的内容摘要。

### 3.3 证据等级与限制

“隔离复现”表示相关类的行为在模拟依赖下得到观察；“静态链路核查”表示已追踪代码路径，但未执行端到端请求；“隔离编译”仅验证选定源码集合的编译行为。

未连接实际 PostgreSQL、Kafka、Redis 或外部 Broker，未运行完整 Maven 构建、全服务部署、渗透测试或压力测试。公网暴露程度、部署环境中的 JWT 公钥是否缺失、真实网关过滤链的响应提交细节等均未核实。表达式测试仅写入并清除临时 JVM 测试属性，没有执行系统命令或读取敏感信息。

报告中的样例编号仅用于说明权限边界和复现现象，不是生产对象，也不是建议的前端接口设计。

### 3.4 风险等级

| 等级 | 本次定义 |
| --- | --- |
| P1 | 可能突破认证授权或数据边界，导致核心功能失效、不可恢复的数据缺失，或阻断可重复构建；应在正式使用前优先修复 |
| P2 | 明确的实现与仓库规范偏差，需要排期修复并验证 |

等级用于本项目的整改排序，不等同于 CVSS 分数。问题状态按审计基线记录；确认修复后应记录修复提交和复核结果。

## 4. 发现汇总

| 编号 | 等级 | 问题 | 涉及模块 | 证据类型 |
| --- | --- | --- | --- | --- |
| AUD-001 | P1 | 缺少或损坏 JWT 公钥时，网关直接接受未验签身份 | gateway / 部署配置 | 隔离复现 |
| AUD-002 | P1 | 客户端可以伪造内部权限上下文 | gateway / common | 隔离复现 |
| AUD-003 | P1 | 多数业务服务的权限注解实际放行 | common / 各业务服务 | 隔离复现 |
| AUD-004 | P1 | 内部接口与服务端口缺少访问边界 | gateway / device / 部署 | 静态链路核查 |
| AUD-005 | P1 | Token 撤销分支完成后仍会进入业务转发 | gateway | 隔离复现 |
| AUD-006 | P1 | 可配置规则表达式能调用 JVM 方法 | rule / 表达式运行时 | 隔离复现 |
| AUD-007 | P1 | 新提交缺少数据流转执行器源码，无法重复构建 | Git / rule 构建 | 隔离编译 |
| AUD-008 | P1 | 流转连接缓存没有隔离租户和凭据 | rule / 数据流转 | 隔离复现 |
| AUD-009 | P1 | 数据范围 SQL 的 IN 列表和逻辑分组生成错误 | common / MyBatis | 隔离复现 |
| AUD-010 | P1 | 分组权限被扩大成整个项目的权限 | common / 数据范围解析 | 隔离复现 |
| AUD-011 | P1 | 数据范围只限制列表，详情和修改可按 ID 绕过 | device / 资源操作 | 静态链路核查 |
| AUD-012 | P1 | 设备与物模型导入实际同步执行 | device / 导入任务 | 隔离复现 |
| AUD-013 | P1 | 设备消息处理失败被吞掉，丢失恢复机会 | device / 消息处理 | 隔离复现 |
| AUD-014 | P2 | 前端导入导出仍保留违反仓库规则的路径 | web / device / 任务中心 | 静态链路核查 |

## 5. 详细发现与验收标准

### AUD-001 [P1] 缺少或损坏 JWT 公钥时，网关直接接受未验签身份

**涉及模块：** gateway / 部署配置。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [AuthGlobalFilter.java:87](../../firefly-gateway/src/main/java/com/songhg/firefly/iot/gateway/filter/AuthGlobalFilter.java#L87)、[AuthGlobalFilter.java:129](../../firefly-gateway/src/main/java/com/songhg/firefly/iot/gateway/filter/AuthGlobalFilter.java#L129)、[application-prod.yml:114](../../firefly-gateway/src/main/resources/application-prod.yml#L114)。

公钥为空或解析失败时，初始化只写日志。随后 `publicKey == null` 分支直接 Base64 解码 Token 的 payload，使用其中的用户和租户信息，不验证签名，也不检查该分支中的有效期。该行为没有限定为开发环境，生产配置也允许公钥缺省为空。

**影响：** 只要部署缺少有效公钥，就能构造身份进入业务转发；不能依靠后续权限层弥补身份来源不可信的问题。是否已有部署触发此条件，本次没有核实运行环境。

**验证：** 使用无有效签名的 Token，网关隔离测试中的下游调用次数为 1。

**建议：** 公钥缺失或解析失败时启动失败，删除绕过验签分支；采用可校验的密钥配置或可信密钥发现机制。

**整改验收标准：** 生产及开发启动时，缺失或损坏公钥均不能进入未验签模式；无效签名、过期 Token 和伪造身份请求均被拒绝；有效 Token 正常通过。

### AUD-002 [P1] 客户端可以伪造内部权限上下文

**涉及模块：** gateway / common。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [AuthGlobalFilter.java:279](../../firefly-gateway/src/main/java/com/songhg/firefly/iot/gateway/filter/AuthGlobalFilter.java#L279)、[WebContextInterceptor.java:28](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/security/WebContextInterceptor.java#L28)、[SecurityAspect.java:48](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/security/SecurityAspect.java#L48)。

JWT 路径仅覆盖用户、租户和平台头，没有清除外部传入的 `X-App-Key-Id`、`X-Granted-Permissions` 等内部身份头。业务服务信任这些头；存在 AppKey ID 时，权限切面改走请求内的 granted permissions，并跳过用户权限查询。

**影响：** 正常登录的低权限用户可在请求中附带伪造的 AppKey 上下文和通配权限，绕过接口权限校验。即使 JWT 验签配置正确，此问题仍独立存在。

**验证：** 网关保留了伪造头；给实际权限切面注入“所有用户均无权限”的检查器后，带伪造 AppKey 上下文的调用仍通过。

**建议：** 在全部入口统一清除内部身份头，再按已验证的身份类型重建上下文；JWT 身份与 AppKey 身份不能由外部请求头切换。

**整改验收标准：** JWT 请求携带任意伪造内部身份头时，下游只能看到网关重建的可信上下文；JWT 和 AppKey 两类身份不能相互注入权限；白名单入口同样清除内部身份头。

### AUD-003 [P1] 多数业务服务的权限注解实际放行

**涉及模块：** common / 各业务服务。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [SecurityAspect.java:53](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/security/SecurityAspect.java#L53)、[PermissionService.java:23](../../firefly-system/src/main/java/com/songhg/firefly/iot/system/service/PermissionService.java#L23)、[FireflyDeviceApplication.java:14](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/FireflyDeviceApplication.java#L14)。

仓库中 `PermissionChecker` 只有 system 模块的实现。device 等独立服务没有引入和扫描该实现，而公共权限切面对检查器使用可选注入；不存在检查器时直接返回成功。

**影响：** 普通 JWT 用户只要已登录，调用 device、rule、support 等服务的 `@RequiresPermission` 接口时就可能不做操作权限校验。前端隐藏菜单或按钮不能建立后端访问边界。

**验证：** 直接调用当前 `SecurityAspect`，未配置检查器时，要求 `device:delete` 的操作通过校验。

**建议：** 为所有业务服务建立统一的可信权限查询或权限上下文方案；检查器缺失必须拒绝请求或阻止启动。

**整改验收标准：** 各独立业务服务均执行权限校验；低权限用户调用创建、修改、删除接口得到拒绝；检查器未装配时不能放行；正常角色权限仍可通过。

### AUD-004 [P1] 内部接口与服务端口缺少访问边界

**涉及模块：** gateway / device / 部署。**证据类型：** 静态链路核查。**状态：** 待整改、待回归验证。

**证据：** [InternalDeviceAuthController.java:102](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/controller/InternalDeviceAuthController.java#L102)、[InternalDeviceController.java:41](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/controller/InternalDeviceController.java#L41)、[DeviceMapper.java:16](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/mapper/DeviceMapper.java#L16)、[docker-compose.prod.yml:238](../../deploy/docker-compose.prod.yml#L238)。

网关业务路由覆盖整个 `/DEVICE/api/**`，未排除 `/api/v1/internal/**`。内部设备接口没有服务身份校验；例如 `issue-token` 直接根据请求提供的设备、租户和产品编号写入 Redis，内部 basic 查询还使用忽略租户的 Mapper。与此同时，部署文件把 system、device 等业务服务端口直接映射到宿主机，业务服务自身又直接信任上下文请求头。

**影响：** 登录用户可以经网关访问本应仅供服务间使用的接口；能访问暴露端口的调用者还可以绕开网关。实际公网可达性取决于部署防火墙，本次未验证。不能以接口路径含有 `internal` 作为授权措施。

**建议：** 网关拒绝公共访问内部路径；内部接口验证服务身份及资源归属；业务服务端口收回内部网络。独立验证外部协议回调入口的真实性。

**整改验收标准：** 公共网关拒绝内部接口；业务服务只接受可信服务身份访问内部接口；任意租户和设备编号不能用于签发 Token；合法服务间调用回归通过。

### AUD-005 [P1] Token 撤销分支完成后仍会进入业务转发

**涉及模块：** gateway。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [AuthGlobalFilter.java:166](../../firefly-gateway/src/main/java/com/songhg/firefly/iot/gateway/filter/AuthGlobalFilter.java#L166)。

Redis 查询后先执行返回 `Mono<Void>` 的分支，再调用 `switchIfEmpty(forward...)`。拒绝响应和正常转发都以无数据完成，因此都会继续触发 fallback；这里没有区分“Redis 没有记录”和“分支执行结束”。

**验证：** 使用真实网关过滤器和模拟的下游链路，结果如下。

| 撤销标记 | Token 签发时间 | 下游链路执行次数 | 响应状态 |
| --- | --- | --- | --- |
| 不存在 | 100 | 1 | 未设置 |
| 50 | 100 | 2 | 未设置 |
| 200 | 100 | 1 | 401 |

**影响：** 已判定撤销的请求仍触发后续过滤链；非过期请求在有撤销标记时可能重复转发。完整网关中响应提交、请求体复用等过滤器对最终表现的影响未做集成验证，但控制流本身已复现错误。

**建议：** 在 Redis 值的层面处理不存在的情况，再进入唯一的授权决策和转发分支，确保拒绝后不再调用下游。

**整改验收标准：** 无撤销记录时仅转发一次；存在记录但 Token 仍有效时仅转发一次；Token 已撤销时转发次数为零，并在真实网关过滤链中验证非幂等请求不会被重复执行。

### AUD-006 [P1] 可配置规则表达式能调用 JVM 方法

**涉及模块：** rule / 表达式运行时。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [RuleRuntimeService.java:366](../../firefly-rule/src/main/java/com/songhg/firefly/iot/rule/service/RuleRuntimeService.java#L366)、[ForwardTemplateRenderer.java:102](../../firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/support/ForwardTemplateRenderer.java#L102)。

规则过滤、字段表达式及数据流转模板使用未限制的 `StandardEvaluationContext`。租户可配置的表达式进入求值，没有类型访问、构造器、方法调用的限制。

**影响：** 配置表达式可以越过“读取消息字段”的业务范围，调用服务器 JVM 能力，具有服务器代码执行风险。已有规则引擎和新增模板渲染器都有这一模式。

**验证：** 在当前 `RuleRuntimeService` 的实际求值方法中执行无害的 `System.setProperty` 探针，成功写入临时测试属性；随后已清除。未执行系统命令或读取敏感信息。

**建议：** 将规则语言约束为必要的数据访问和计算能力，显式限制类型、构造器与方法调用，并对表达式复杂度和耗时设定边界。

**整改验收标准：** 允许的字段读取和计算表达式保持可用；类型访问、构造器、未授权方法调用被拒绝；复杂度和执行耗时受限；规则、告警及流转模板按同一边界验收。

### AUD-007 [P1] 新提交缺少数据流转执行器源码，无法重复构建

**涉及模块：** Git / rule 构建。**证据类型：** 隔离编译。**状态：** 待整改、待回归验证。

**证据：** [.gitignore:4](../../.gitignore#L4)、[DataForwardRuntimeService.java:11](../../firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/service/DataForwardRuntimeService.java#L11)。

数据流转执行器放在 Java 包目录 `dataforward/target/` 下，被通用的 `target/` 忽略规则排除。`git ls-files` 未列出该目录的接口和实现；`git check-ignore -v` 明确命中 `.gitignore:4`。提交 `d6ec5fa` 引用了 `DataForwardTargetExecutor`，却没有包含它。

**验证：** 仅选择 Git 跟踪的 74 个 rule 主源码文件进行隔离编译，使用本地依赖及 common/api 编译产物，得到 3 个编译错误，首个错误为 `package com.songhg.firefly.iot.rule.dataforward.target does not exist`。未运行完整 Maven 构建。

**影响：** 本地存在未跟踪文件或旧 class 时可能看似正常，干净检出和 CI 构建会缺少源码。

**建议：** 调整包名或精确限定构建产物忽略规则，将执行器源码纳入版本管理，并以干净检出的构建结果作为交付检查。

**整改验收标准：** 在全新检出且无旧 class 的环境完成正常模块编译；执行器接口及实现全部被版本管理跟踪；忽略规则不会再吞掉业务源码。

### AUD-008 [P1] 流转连接缓存没有隔离租户和凭据

**涉及模块：** rule / 数据流转。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** `firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/target/MqttForwardExecutor.java:83`（本地未跟踪源码）、`firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/target/AmqpForwardExecutor.java:75`（本地未跟踪源码）。这两份文件在本地存在，但尚未被当前提交跟踪，参见 AUD-007。

执行器是跨租户共用的单例。MQTT 缓存键包含 broker、clientIdPrefix、username；AMQP 缓存键包含 host、port、vhost、username。两者均不包含租户身份或凭据版本；命中缓存后直接返回已有连接，不再检查本次密码。

**影响：** 同节点内，另一租户配置相同连接地址和用户名，即使密码错误，也可能借用先前租户的已认证连接发布消息；正常更换密码同样不能可靠切换连接。

**验证：** 向缓存放入模拟的已认证连接，再以错误密码调用实际连接获取方法，MQTT 和 AMQP 均返回同一个旧连接；测试没有连接外部 Broker。

**建议：** 缓存按租户和连接配置身份隔离，凭据变更必须使旧连接失效；处理并发创建落败连接和失效连接的关闭。

**整改验收标准：** 租户 A 建立连接后，租户 B 使用同地址和用户名但错误凭据不能复用；凭据轮换使旧连接失效；并发创建落败连接及失效连接被关闭。

### AUD-009 [P1] 数据范围 SQL 的 IN 列表和逻辑分组生成错误

**涉及模块：** common / MyBatis。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [DataScopeInterceptor.java:94](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/mybatis/DataScopeInterceptor.java#L94)、[DataScopeInterceptor.java:176](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/mybatis/DataScopeInterceptor.java#L176)。

当前依赖下，普通 `ExpressionList` 被渲染成不带括号的列表；同一个方法还把范围中的多个条件直接通过 OR 拼接，再与原条件做 AND，没有为 OR 整体加括号。

**验证：** 当前拦截器实际生成的 SQL 为：

```sql
SELECT * FROM devices
WHERE tenant_id = 1 AND status = 'ACTIVE' AND deleted_at IS NULL
AND project_id IN 10 OR id IN 20
```

**影响：** `IN 10` 不符合 PostgreSQL 的 `IN (...)` 形式；即便只修补 IN 列表，未分组的 OR 仍会使后半部分绕开原来的状态、逻辑删除等筛选。实际数据库执行未测试；这里已复现的是发送前的 SQL 字符串。

**建议：** 使用明确带括号的列表节点，同时将原条件与整组权限条件分别正确分组；覆盖 PROJECT、GROUP、CUSTOM 和已有 OR 条件的 SQL 行为测试。

**整改验收标准：** 在 PostgreSQL 上执行 ALL、SELF、PROJECT、GROUP、CUSTOM 的代表性查询；IN 列表和 OR 分组正确；租户、状态、逻辑删除及原查询条件均保持有效。

### AUD-010 [P1] 分组权限被扩大成整个项目的权限

**涉及模块：** common / 数据范围解析。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [DatabaseDataScopeResolver.java:143](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/mybatis/scope/DatabaseDataScopeResolver.java#L143)、[DataScopeInterceptor.java:162](../../firefly-common/src/main/java/com/songhg/firefly/iot/common/mybatis/DataScopeInterceptor.java#L162)。

解析 GROUP 权限时，除了收集分组中的设备，还把这些设备所属的项目和产品加入可访问集合。设备查询再将项目范围与设备范围按 OR 合并。

**影响：** 只授权一个分组中的设备 A，也会匹配同项目中不属于该组的设备 B。父级信息用于展示关联对象，不应自动成为父级全部子资源的授权。

**验证：** 仅给分组配置设备 10，实际解析结果额外包含项目 100、产品 200，并生成项目与设备的 OR 条件。此逻辑错误独立于AUD-009，修复 SQL 语法后仍存在。

**建议：** 保留授权来源和范围语义，区分“可以读取关联父对象”和“获得父对象下所有资源”的授权。

**整改验收标准：** 仅授权分组中设备 A 时，同项目、同产品但不属于该组的设备 B 不可见；读取必要父级信息不会扩大对子设备的授权。

### AUD-011 [P1] 数据范围只限制列表，详情和修改可按 ID 绕过

**涉及模块：** device / 资源操作。**证据类型：** 静态链路核查。**状态：** 待整改、待回归验证。

**证据：** [DeviceService.java:185](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java#L185)、[DeviceService.java:284](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java#L284)、[DeviceService.java:1044](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java#L1044)。

设备列表有 `@DataScope`，但详情、更新、启停、删除、读取密钥都调用没有范围校验的 `getActiveDevice`。该方法按 ID 查询，只判断存在与删除状态；没有验证当前用户是否获得该项目或设备的数据授权。

**影响：** 即便修好接口操作权限，同租户中“有读取或修改权限、但只授权部分设备”的用户仍可直接访问范围外设备。租户过滤不能代替用户的数据范围约束。

**建议：** 让资源加载与变更共用带数据范围的授权入口，对查详情、读密钥和写操作单独补越权测试。

**整改验收标准：** 对同租户但范围外的资源，详情、密钥、修改、启停、删除均被拒绝；范围内操作正常；跨租户拒绝逻辑保持有效。

### AUD-012 [P1] 设备与物模型导入实际同步执行

**涉及模块：** device / 导入任务。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [DeviceImportService.java:80](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceImportService.java#L80)、[ThingModelImportService.java:81](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/ThingModelImportService.java#L81)。

注册任务方法直接调用同一对象的 `executeImportAsync`，绕过外部代理。`@Async` 没有切换线程；物模型导入方法上的 `@Transactional` 也不能由这次内部调用建立事务。

**影响：** 注册接口会等待下载、解析及批量写入，前端 15 秒超时可能发生在任务仍处理期间，用户也无法及时拿到 taskId。任务中心有状态记录，并不代表执行过程已异步化。

**验证：** 通过 Spring 异步代理调用实际 `registerImportTask`，配置执行器调用次数为 0，文件处理仍运行在调用线程。

**建议：** 独立任务执行组件，通过代理或持久化任务队列分派；同时明确任务认领、取消和进程重启后的恢复机制。

**整改验收标准：** 注册接口及时返回任务标识，执行发生在独立执行器或任务工作进程；实际事务边界正确；进度、失败、取消和进程重启后的处理状态可核验。

### AUD-013 [P1] 设备消息处理失败被吞掉，丢失恢复机会

**涉及模块：** device / 消息处理。**证据类型：** 隔离复现。**状态：** 待整改、待回归验证。

**证据：** [DeviceMessageConsumer.java:44](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceMessageConsumer.java#L44)、[MessageRouterService.java:58](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/MessageRouterService.java#L58)。

消费入口捕获所有异常后仅记录日志并正常返回；路由层对遥测持久化、影子更新等失败同样捕获后继续。消费框架没有收到业务失败信号，代码中没有对应的持久化失败任务或补偿入口。

**影响：** 数据库或下游短暂失败时，上报数据可能永久缺失，而后续规则处理仍继续，出现持久化与业务动作不一致。简单给 Listener 加重试不够，还必须处理路由层吞异常及成功步骤的幂等。

**验证：** 模拟路由抛出数据库异常，实际 `DeviceMessageConsumer` 向调用方正常返回。

**建议：** 明确各步骤成功条件，保留可重试失败，配置有限重试及失败队列，按消息标识建立幂等。新增数据流转文档明确采用尽力投递，不应把它默认解释为可靠事件投递；如业务依赖可靠通知，应单独收敛该语义。

**整改验收标准：** 注入数据库或下游短暂故障后，消息进入可观测的重试或失败处理流程；重试不会重复产生已完成副作用；最终失败可定位和补偿。

### AUD-014 [P2] 前端导入导出仍保留违反仓库规则的路径

**涉及模块：** web / device / 任务中心。**证据类型：** 静态链路核查。**状态：** 待整改、待回归验证。

**证据：** [ProductThingModelDrawer.tsx:1919](../../firefly-web/src/pages/product/ProductThingModelDrawer.tsx#L1919)、[DeviceList.tsx:87](../../firefly-web/src/pages/device/DeviceList.tsx#L87)、[DeviceService.java:265](../../firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceService.java#L265)。

物模型参数导入仍用浏览器 `XLSX.read(file.arrayBuffer())` 解析；设备三元组导出同步查询全部匹配设备，把密钥列表返回浏览器后拼装 CSV。CSV 还直接导出设备和产品数据库 ID。

**影响：** 没有统一的任务进度、失败记录和大批量处理边界；大结果集会增加接口与浏览器内存压力。该实现明确违反“文件解析和导入导出走后端异步任务中心”以及优先使用业务唯一键的仓库要求。

**建议：** 所有导入导出统一走文件存储与异步任务中心；导出使用产品 Key、设备名称等业务标识，明确密钥导出的独立权限。

**整改验收标准：** 参数导入和三元组导出均进入后端任务中心；浏览器不解析导入文件；任务进度、失败记录和下载结果可查询；导出以业务标识为主，密钥导出有明确权限。

## 6. 整改顺序与责任边界

| 阶段 | 发现编号 | 目标 | 建议牵头范围 |
| --- | --- | --- | --- |
| 第一阶段 | AUD-007 | 恢复仓库源码完整性，建立干净检出构建检查 | 构建与交付维护者 |
| 第二阶段 | AUD-001 至 AUD-006 | 统一身份来源、接口权限和内部访问边界，限制表达式能力 | 网关、公共安全组件及各服务维护者 |
| 第三阶段 | AUD-008 至 AUD-011 | 修复连接隔离与资源数据授权，覆盖同租户越权场景 | 规则服务、公共持久层、设备服务维护者 |
| 第四阶段 | AUD-012 至 AUD-014 | 落实任务异步执行、消息失败恢复和统一导入导出 | 设备服务、任务中心及前端维护者 |

牵头范围为建议，尚未指派具体人员或承诺完成日期。每项整改应明确负责人、修复提交、回归用例与复核结果，不应仅因代码已修改就关闭发现。

修复涉及菜单、权限点或所属空间时，应同步维护 Flyway 菜单和权限台账；其他实现、运维和使用行为变化应按仓库规则更新相应文档。对尚未正式使用的系统，应直接删除失效的旧路径和放行分支，避免继续增加兼容逻辑。

## 7. 设计收敛建议

1. **统一信任与授权边界。** 网关、内部服务、AppKey、JWT 和设备回调需要明确且不能由客户端切换的身份来源；安全组件缺失时拒绝访问。
2. **统一资源授权语义。** 租户隔离、操作权限和资源范围分别校验；列表、详情、密钥读取和写操作采用一致的范围判断。父级关联信息不能自动扩大对子资源的授权。
3. **明确异步与消息成功条件。** 任务注册、执行认领、完成、失败、取消、重试和幂等分别落地；失败不能只留下日志。对外尽力投递与可靠事件通知应在设计和使用约定中明确区分。
4. **以可重复构建作为交付门槛。** 在干净检出上验证源码完整性，避免缓存 class 和未跟踪文件掩盖提交遗漏。

## 8. 验证证据摘要

以下为上一轮隔离探针的关键输出，保留其测试边界，不把模拟调用等同于生产攻击验证。

| 发现 | 观察结果 |
| --- | --- |
| AUD-001 | 无有效签名 Token 在公钥为空分支触发下游链路 1 次 |
| AUD-002 | 网关保留伪造权限头；注入无权限用户检查器后，伪造 AppKey 上下文仍通过权限切面 |
| AUD-003 | 未装配 PermissionChecker 时，要求 `device:delete` 的校验通过 |
| AUD-005 | Token 签发时间 100；无撤销标记转发 1 次，标记 50 转发 2 次，标记 200 返回 401 但仍转发 1 次 |
| AUD-006 | `RULE_SPEL: JVM static method call reachable=true` |
| AUD-007 | 74 个 Git 跟踪的 rule 主源码文件，隔离编译退出码 1，3 个缺少执行器类型的错误 |
| AUD-008 | MQTT 与 AMQP 均出现 `wrong credentials reused established connection=true` |
| AUD-009 | 实际生成 `project_id IN 10 OR id IN 20`；未连接 PostgreSQL 执行 |
| AUD-010 | 仅授权分组内设备 10，解析结果额外包含项目 100、产品 200 |
| AUD-012 | `ASYNC_IMPORT: executorInvocations=0, runsOnCaller=true` |
| AUD-013 | 路由抛出模拟数据库异常后，消费者向监听容器正常返回 |

AUD-004、AUD-011、AUD-014 的证据为正文中的静态调用链核查，未执行端到端验证。JSQLParser 能接受自身输出不代表 PostgreSQL 语法有效；AUD-009 的数据库执行验证应作为整改验收的一部分。

### 8.1 未跟踪源码证据

AUD-008 使用的执行器源码在审查时本地存在，但被忽略规则排除。为避免远端文档链接指向不存在的 Git 文件，该项采用仓库相对路径和 SHA-256 标识证据版本。

| 本地证据文件 | SHA-256 |
| --- | --- |
| `firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/target/MqttForwardExecutor.java` | `e30f8af8343d1393c716f1d6b987657da647a07ad7ff4fde4ef222d04724cc41` |
| `firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/target/AmqpForwardExecutor.java` | `5c1e67245342860e98d87b5970ccc86932f41a7cd0028a4e168c649e3c0809e5` |

MQTT 获取连接时先按 `broker + clientIdPrefix + username` 查缓存，命中且连接正常即返回；AMQP 按 `host + port + vhost + username` 执行相同逻辑。这些参数不包含租户身份，也不包含密码或凭据版本。

### 8.2 构建遗漏检查

以下只读命令可检查审计基线是否跟踪了执行器源码：

```bash
git ls-tree -r --name-only d6ec5fa -- firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/target
git check-ignore -v firefly-rule/src/main/java/com/songhg/firefly/iot/rule/dataforward/target/DataForwardTargetExecutor.java
```

审查时前一条没有列出文件，后一条命中 `.gitignore:4:target/`。这说明本地目录存在并不等于提交包含源码。正文记录的隔离编译已进一步观察到缺少 `DataForwardTargetExecutor` 类型。

### 8.3 临时探针说明

本轮隔离探针为审查环境临时材料，没有作为项目正式测试提交。报告已记录关键观察结果，整改时应将对应边界转为可持续运行的仓库回归测试；临时探针不作为报告阅读或整改的外部依赖。

## 9. 复核与关闭条件

每项发现只有在其验收标准通过并完成相关集成验证后才可关闭。复核记录至少包括：发现编号、修复提交、验证环境、执行用例、实际结果和复核人。未验证的部署前提和失败路径应继续标为待确认，不能用单元测试通过替代部署验证。

本报告归档仅表示审计文档已生成，不表示缺陷已修复或新版本已验收通过。
