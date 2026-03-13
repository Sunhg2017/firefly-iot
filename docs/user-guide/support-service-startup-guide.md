# Support 服务启动使用说明

## 1. 适用角色

- 后端开发
- 本地联调人员
- 运维排障人员

## 2. 启动前准备

确保以下依赖可用：

- PostgreSQL
- Redis
- Kafka
- Nacos
- MinIO

默认连接地址见 [`application.yml`](/E:/codeRepo/service/firefly-iot/firefly-support/src/main/resources/application.yml)。

## 3. 启动步骤

### 3.1 进入模块目录

```bash
mvn -pl firefly-common,firefly-api install -DskipTests
cd firefly-support
```

### 3.2 启动服务

```bash
mvn spring-boot:run
```

### 3.3 预期结果

正常情况下日志会继续通过以下阶段：

- Nacos 配置加载
- 数据源初始化
- Flyway 迁移
- Tomcat 启动

如果成功启动，默认 HTTP 端口为 `9060`。

## 4. 常见问题

### 4.1 为什么会报 `Found more than one migration with version 5`？

这是 Flyway 迁移版本号重复导致的。当前仓库已经把定时任务初始化脚本调整为 `V6__init_scheduled_tasks.sql`，如果你仍看到这个错误，通常说明：

- 本地代码还不是最新
- `target/classes/db/migration/` 里残留了旧文件

### 4.2 为什么不推荐从仓库根目录直接跑 `mvn -pl firefly-support spring-boot:run`？

因为 Maven 可能先在父工程 `firefly-iot` 上执行 `spring-boot:run`，而父工程不是可启动应用。最稳妥的方式是进入 `firefly-support` 目录再启动。

### 4.3 怎么快速判断是不是 Flyway 阶段失败？

看日志里是否出现：

- `flywayInitializer`
- `Found more than one migration with version`
- 具体的 `db/migration/*.sql`

如果有这些关键字，优先排查迁移脚本，而不是 Controller 或 Service 注入。

### 4.4 启动成功了，为什么访问接口又报 `AppContextHolder` 缺失？

这通常不是 `firefly-support` 自己的源码没编进去，而是本地 Maven 仓库里还在使用旧的 `firefly-common` 快照。先执行：

```bash
mvn -pl firefly-common,firefly-api install -DskipTests
```

然后再进入 `firefly-support` 目录重启服务。
