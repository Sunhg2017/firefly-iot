# System/Support 启动 Flyway 运维说明

## 1. 适用范围

适用于以下服务：

- `firefly-system`
- `firefly-support`

## 2. 当前策略

### 2.1 开发环境

- 默认 `spring.flyway.validate-on-migrate=false`
- 目的：避免历史 checksum 漂移阻塞本地与联调环境启动

### 2.2 生产环境

- 默认 `spring.flyway.validate-on-migrate=true`
- 目的：保留严格迁移校验，防止历史脚本漂移被静默吞掉

## 3. 启动前检查

1. PostgreSQL、Redis、Kafka、Nacos 已可连接。
2. 当前激活 profile 是否正确。
3. 若需要严格检查历史迁移，可显式设置：

```bash
set FLYWAY_VALIDATE_ON_MIGRATE=true
```

PowerShell：

```powershell
$env:FLYWAY_VALIDATE_ON_MIGRATE="true"
```

## 4. 启动命令

先编译依赖模块：

```bash
mvn -pl firefly-common,firefly-api -am install -DskipTests
```

启动 `firefly-system`：

```bash
cd firefly-system
mvn spring-boot:run
```

启动 `firefly-support`：

```bash
cd firefly-support
mvn spring-boot:run
```

## 5. 常见故障

### 5.1 日志出现 `Migration checksum mismatch`

开发环境：

- 默认不会再阻塞启动。
- 若人为打开了 `FLYWAY_VALIDATE_ON_MIGRATE=true`，则仍会严格失败。

生产环境：

- 这是需要处理的正式迁移问题。
- 应检查对应服务的 Flyway 历史表，并按 Flyway 标准 repair 流程执行。

### 5.2 日志出现 `AppContextHolder`、`ParserStatus` 等类缺失

这通常是本地 Maven 仓库里的内部 SNAPSHOT 依赖过旧，先执行：

```bash
mvn -pl firefly-common,firefly-api -am install -DskipTests
```

然后重新启动目标服务。

## 6. 验收口径

### 6.1 `firefly-system`

- 默认端口 `8081`
- 日志中应出现 Tomcat 启动成功信息
- 不应再在 `flywayInitializer` 阶段因 checksum mismatch 退出

### 6.2 `firefly-support`

- 默认端口 `9060`
- 日志中应出现 Tomcat 启动成功信息
- 不应再在 `flywayInitializer` 阶段因 checksum mismatch 退出

## 7. 回滚说明

若需要回滚本次策略，应同时回滚：

- `firefly-system/src/main/resources/application.yml`
- `firefly-system/src/main/resources/application-prod.yml`
- `firefly-support/src/main/resources/application.yml`
- `firefly-support/src/main/resources/application-prod.yml`
- 本文档及配套设计、使用文档

回滚后，开发环境将重新对历史 checksum 严格校验，旧数据库可能再次无法启动。
