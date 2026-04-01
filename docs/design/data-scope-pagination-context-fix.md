# MyBatis-Plus 分页与数据权限上下文修复设计

## 背景

2026-04-01 本地通过网关联调 `POST /DEVICE/api/v1/devices/list`、`POST /DEVICE/api/v1/products/list` 时确认到同一类异常：

- 返回 `records` 有真实数据
- 同一响应里的 `total=0`、`pages=0`
- `pageSize` 明明传了 5 或 2，返回记录数却超过分页大小

结合运行时 SQL 日志进一步确认：

- 查询只执行了 `records` SQL，没有任何 `count` SQL
- 记录查询 SQL 也没有 `LIMIT / OFFSET`

这说明问题不只是数据权限上下文，而是 MyBatis-Plus 分页拦截器本身没有生效；在分页恢复后，`@DataScope` 还必须保证同一次调用里的 `count + records` 共享同一上下文。

## 根因

本次实际存在两层根因。

### 1. 公共 MyBatis 配置注册时机错误

`MybatisPlusConfig` 位于公共模块并通过组件扫描加载，但类上额外加了 `@ConditionalOnBean(DataSource.class)`。

在当前 Spring Boot 启动顺序下，这个条件会在 `DataSource` 自动配置完成前就参与判断，导致整个 `MybatisPlusConfig` 直接被跳过，后果包括：

- `MybatisPlusInterceptor` 未注册
- `PaginationInnerInterceptor` 未生效
- `TenantLineInnerInterceptor` 未生效
- `DataScopeInterceptor` 也不会注册到 MyBatis

因此分页查询退化为普通 `select`：

- 没有 `count`
- 没有分页 SQL 改写
- 最终 `records` 返回全量，`total/pages` 保持默认 0

### 2. 数据权限上下文生命周期过短

即便恢复分页拦截器后，原来的数据权限实现仍有隐患：

- `DataScopeAspect` 只在 `@Before` 阶段设置上下文
- `DataScopeInterceptor` 第一次读取就 `getAndClear()`

MyBatis-Plus 标准分页会执行至少两条 SQL：

1. `count`
2. `records`

如果上下文在第一条 SQL 就被清掉，就会再次出现同一分页调用内 `count` 与 `records` 口径不一致的问题。

## 目标

- 确保公共 MyBatis 拦截器在所有依赖模块中稳定注册
- 恢复标准分页：`count`、`LIMIT / OFFSET`、`total/pages`
- 让 `@DataScope` 在一次方法调用内覆盖全部 SQL，而不是只覆盖第一条 SQL
- 不保留双轨或兼容分支，直接收口到唯一正确生命周期

## 方案

### 1. 去掉会提前短路的类级 DataSource 条件

`MybatisPlusConfig` 不再依赖类级 `@ConditionalOnBean(DataSource.class)`，改为通过 `ObjectProvider<DataSource>` 延迟读取数据源。

这样做的目的：

- 避免组件扫描阶段因为 `DataSource` 尚未自动配置完成而把整套 MyBatis-Plus 配置跳过
- 保证 `MybatisPlusInterceptor`、`DataScopeInterceptor`、`MetaObjectHandler` 都能稳定注册
- `tenant_id` 元数据检查仍在真正执行 SQL 时再读取数据源，不提前触发连接

### 2. DataScope 改为方法级生命周期

- `DataScopeAspect` 从 `@Before` 改为 `@Around`
- 在方法进入时设置上下文，`finally` 中恢复旧上下文或清理
- `DataScopeInterceptor` 只读 `get()`，不再消费式清空

这样同一方法内的：

- `count`
- `records`
- 补充查询

都共享同一份数据权限上下文。

## 影响范围

所有依赖 `firefly-common` 且使用 MyBatis-Plus 分页的服务都会受益，重点包括：

- `firefly-device`
- `firefly-system`
- `firefly-rule`
- `firefly-support`
- `firefly-data`
- `firefly-media`

其中所有分页列表、租户隔离查询、`@DataScope` 查询都属于本次公共修复范围。

## 验证口径

### 运行时证据

修复前在本地 `firefly-device` 日志中已明确看到：

- `devices/list` 只有普通 `SELECT ... ORDER BY created_at DESC`
- 没有 `COUNT(*)`
- 没有 `LIMIT / OFFSET`

这与网关返回的：

- `records` 为 7 条
- `pageSize=5`
- `total=0`
- `pages=0`

完全一致，证明根因在 MyBatis-Plus 拦截器链未注册。

### 修复后预期

- 同一分页请求会先出现 `count` SQL，再出现带分页条件的查询 SQL
- 接口返回的 `recordCount` 不超过 `pageSize`
- `total`、`pages` 与记录集口径一致
- 对带 `@DataScope` 的接口，`count` 与 `records` 使用同一数据权限范围

## 风险与取舍

- 如果只保留这次新增的 `DataScope` 生命周期修复，而不修公共配置注册问题，分页仍然不会生效。
- 如果只修公共配置注册，不修 `DataScope` 生命周期，分页恢复后仍可能在受数据权限约束的接口上出现统计与记录口径错位。
- 因此这次按“拦截器注册 + 数据权限生命周期”一次性收口，不保留旧实现。
