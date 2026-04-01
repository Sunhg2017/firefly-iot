# MyBatis-Plus 分页与数据权限修复运维说明

## 影响范围

- `firefly-common`
- 所有依赖 `firefly-common` 且使用 MyBatis-Plus 的服务，重点是：
  - `firefly-device`
  - `firefly-system`
  - `firefly-rule`
  - `firefly-support`
  - `firefly-data`
  - `firefly-media`

## 典型现象

未升级前，分页接口可能出现以下任一异常：

- 返回了真实 `records`，但 `total=0`
- `pages=0`，分页器无法正常显示
- 请求传了 `pageSize=5`，接口却返回超过 5 条记录
- SQL 日志里看不到 `COUNT(*)`
- SQL 日志里看不到 `LIMIT / OFFSET`

## 根因摘要

本次问题不是单点故障，而是两个公共层问题叠加：

1. `MybatisPlusConfig` 因类级 `@ConditionalOnBean(DataSource.class)` 被提前跳过，导致分页、租户、数据权限拦截器没有注册进 MyBatis。
2. `@DataScope` 上下文原来只覆盖第一条 SQL，分页恢复后会让 `count` 与 `records` 再次口径不一致。

## 发布步骤

1. 发布包含本次修复的 `firefly-common`
2. 重新编译依赖该公共模块的服务
3. 重启相关服务
4. 优先回归：`firefly-device`、`firefly-system`

如果本地使用 `spring-boot:run`：

1. 先执行依赖模块编译（至少包含 `firefly-common`）
2. 再重启目标服务

只重启业务模块、但没有重新编译公共模块，会继续跑旧类。

## 验证清单

### 1. 设备列表示例

```bash
curl -s http://localhost:8080/DEVICE/api/v1/devices/list \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"pageNum":1,"pageSize":5}'
```

确认：

- `records` 数量不超过 `pageSize`
- `total` 大于 0
- `pages` 大于 0
- 同时检查服务日志，能看到 `count` SQL 和分页 SQL

### 2. 产品列表示例

```bash
curl -s http://localhost:8080/DEVICE/api/v1/products/list \
  -H "Authorization: Bearer <token>" \
  -H 'Content-Type: application/json' \
  -d '{"pageNum":1,"pageSize":2}'
```

确认：

- 返回记录数不超过 2
- `total/pages` 正常

### 3. 数据权限接口抽查

至少抽查一条带 `@DataScope` 的分页接口，确认：

- `count` 与 `records` 口径一致
- 切换筛选条件后总数不会异常归零

## 常见问题

### 1. 升级后仍然返回全量记录

排查顺序：

1. 确认运行进程已经重启
2. 确认 `firefly-common` 已重新编译进当前类路径
3. 检查日志里是否仍然没有 `COUNT(*)` / `LIMIT / OFFSET`
4. 若仍没有，确认运行中的不是旧的 `target/classes`

### 2. 总数恢复了，但部分受权限控制的列表仍异常

排查顺序：

1. 检查接口是否真的走到了 `@DataScope`
2. 检查是否存在自定义分页逻辑绕开标准 `selectPage`
3. 检查调用链里是否还有异步线程切换导致 `ThreadLocal` 上下文丢失

## 回滚说明

如需回滚，需要同时回退以下内容：

1. `MybatisPlusConfig`
2. `DataScopeAspect`
3. `DataScopeContextHolder`
4. `DataScopeInterceptor`
5. 本次三份文档

回滚后会重新暴露“分页失效”以及“数据权限分页口径错位”的已知问题，不建议作为常态方案。
