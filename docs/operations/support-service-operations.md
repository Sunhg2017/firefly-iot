# Support 服务运维说明

## 1. 模块说明

`firefly-support` 提供以下基础支撑能力：

- 文件上传与下载
- 站内信
- 异步任务中心
- 通知中心
- 定时任务管理

服务启动依赖 PostgreSQL、Redis、Kafka、Nacos、MinIO，以及 Flyway 自动迁移。

## 2. 启动方式

推荐从模块目录启动：

```bash
cd ..
mvn -pl firefly-common,firefly-api install -DskipTests
cd firefly-support
mvn spring-boot:run
```

说明：

- `firefly-support` 依赖仓库内 `firefly-common`、`firefly-api` 的最新 `SNAPSHOT`。如果本地 Maven 仓库里还是旧 jar，运行期可能报 `AppContextHolder` 等内部类缺失。
- 根目录执行 `mvn -pl firefly-support spring-boot:run` 时，Maven 可能先在父工程 `firefly-iot` 上解析 `spring-boot:run`，不适合作为标准启动方式。
- 运维和本地排障默认都应进入模块目录执行。

## 3. 关键配置

配置文件位于 [`application.yml`](/E:/codeRepo/service/firefly-iot/firefly-support/src/main/resources/application.yml)。

重点关注：

- `spring.datasource.*`
- `spring.flyway.*`
- `spring.data.redis.*`
- `spring.kafka.*`
- `spring.cloud.nacos.*`
- `minio.*`

## 4. Flyway 迁移要求

当前迁移链路：

- `V2__init_notification_center.sql`
- `V3__init_in_app_messages.sql`
- `V4__init_async_tasks.sql`
- `V5__async_task_refactor.sql`
- `V6__init_scheduled_tasks.sql`

运维要求：

- 同一模块下的 Flyway 版本号必须唯一。
- 新增脚本前，必须先检查 `src/main/resources/db/migration/` 中已有版本。
- 禁止继续新增重复版本号，例如再次出现两个 `V6__...sql`。

## 5. 常见故障

### 5.1 启动时报 Flyway 重复版本

现象：

- `Found more than one migration with version X`

排查：

- 检查 `firefly-support/src/main/resources/db/migration/` 是否有重复版本号脚本。
- 检查打包后的 `target/classes/db/migration/` 是否仍残留旧文件。

处理：

- 保证版本号唯一。
- 重新编译后再启动。

### 5.2 启动时报某迁移 SQL 执行失败

排查：

- 检查对应脚本是否有注释吞掉 SQL、缺分号、缺闭合引号等基础问题。
- 检查 PostgreSQL 中目标表是否已被手工创建成不兼容结构。

### 5.3 启动后接口请求时报内部类缺失

现象：

- `NoClassDefFoundError: com.songhg.firefly.iot.common.context.AppContextHolder`

排查：

- 检查本地 Maven 仓库中的 `firefly-common`、`firefly-api` 是否为最新快照
- 检查是否直接在模块目录运行了 `spring-boot:run`，但从未更新过上游内部模块

处理：

```bash
mvn -pl firefly-common,firefly-api install -DskipTests
```

### 5.3 启动时报 Nacos 配置为空

当前 `firefly-support` 对缺失的 Nacos 配置使用了 `optional:nacos:`，因此空配置只会打警告，不会直接导致服务失败。真正阻塞启动时，应优先看 Flyway 和数据库连接日志。

## 6. 验证命令

```bash
mvn -pl firefly-support -DskipTests compile
cd firefly-support
mvn spring-boot:run
```

## 7. 回滚方式

若需要回滚本次启动修复，应同时回滚：

- `V6__init_scheduled_tasks.sql`
- 对旧 `V5__init_scheduled_tasks.sql` 的删除
- 对应设计、运维、使用说明

不建议只回滚其中一部分，否则会重新引入 Flyway 启动失败。
