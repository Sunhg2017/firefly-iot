# 操作日志自动记录修复设计

## 1. 背景

系统已经提供了 `操作日志` 页面、`operation_logs` 表、查询接口以及 `OperLogAspect` 切面，但现场表现为“操作日志没有记录任何东西”。

排查结果明确表明根因是记录入口没有接通：

- `OperLogAspect` 只拦截 `@OperLog`
- 仓库内没有任何 Controller 方法实际使用 `@OperLog`
- 因此 `operation_logs` 只具备查询能力，没有任何真实写入来源

这不是前端查询页或数据库表结构问题，而是操作日志依赖的注解模型已经失效。

## 2. 目标

- 恢复系统管理接口的操作日志写入能力
- 不再依赖“人工给每个接口补注解”这种容易漏记的方式
- 保持现有 `operation_logs` 表、查询接口和页面不变

## 3. 范围

涉及文件：

- `firefly-system/src/main/java/com/songhg/firefly/iot/system/aspect/OperLogAspect.java`
- `firefly-system/src/test/java/com/songhg/firefly/iot/system/aspect/OperLogAspectTest.java`

不涉及：

- `operation_logs` 表结构
- 操作日志页面字段结构
- 菜单、权限点和 Flyway SQL

## 4. 方案

### 4.1 从显式注解改为系统控制器自动记录

- 将 `OperLogAspect` 的切点从 `@OperLog` 改为 `firefly-system` 控制器公开接口
- 对系统控制器请求默认生成操作日志
- 继续保留 `@OperLog` 作为显式覆盖入口，便于后续特殊接口自定义模块、类型和描述

### 4.2 从现有 OpenAPI 注解推导日志元数据

当前控制器已经普遍维护了：

- 类上的 `@Tag`
- 方法上的 `@Operation(summary = ...)`

因此本次直接复用现有元数据：

- `module` 优先取 `@OperLog.module`，否则取控制器 `@Tag.name`
- `description` 优先取 `@OperLog.description`，否则取 `@Operation.summary`
- `operationType` 优先取 `@OperLog.operationType`，否则按 `summary + HTTP 请求` 自动归类为 `CREATE / UPDATE / DELETE / QUERY / EXPORT / LOGIN / LOGOUT`

这样不需要大批量给既有接口补注解，也不会再出现新接口默认漏记。

### 4.3 跳过自我噪音和隐藏接口

为了避免日志页本身不断制造新日志，本次跳过：

- `OperationLogController`
- `AuditLogController`
- `LoginLogController`

同时跳过 `@Hidden` 标记的内部接口，避免把内部同步或网关协作流量记成后台操作。

### 4.4 请求参数序列化收口

- 记录请求参数时过滤 `HttpServletRequest`、`HttpServletResponse`、`BindingResult`、`MultipartFile`
- 避免因为不可序列化对象导致操作日志记录失败

## 5. 关键取舍

- 没有继续沿用“给每个方法人工补 `@OperLog`”的路径，因为当前仓库已经证明这种方式完全不可维护。
- 没有改操作日志前端页面，因为前端查询链路本身是正常的，根因只在后端根本没写数据。
- 没有把日志查询接口自身纳入记录范围，避免页面刷新一次就新增一条“查询操作日志”的噪音记录。

## 6. 风险与边界

- 本次自动记录范围只覆盖 `firefly-system` 控制器，请求进入其他微服务的操作仍需各服务自行落日志能力。
- `operationType` 是基于现有 `@Operation.summary` 和请求信息自动推导的，如果后续某些接口摘要写法过于模糊，展示类型可能需要再微调。
