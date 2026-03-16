# Connector 启动类路径隔离运维说明

## 1. 适用范围

适用于 `firefly-connector` 本地开发、联调和启动排障。

## 2. 推荐启动方式

### 2.1 根目录 reactor 启动

推荐在仓库根目录执行：

```bash
mvn -pl firefly-connector -am -DskipTests spring-boot:run
```

说明：

- `-am` 会把 `firefly-common`、`firefly-api`、`firefly-plugin-api` 一并纳入本次 reactor
- 非应用模块已配置 `spring-boot:run` 自动跳过，不会再因“没有 main class”中断

### 2.2 模块目录启动

如果需要在 `firefly-connector` 目录直接启动，先确保兄弟模块已有最新编译产物：

```bash
mvn -pl firefly-common,firefly-api,firefly-plugin-api,firefly-connector -am -DskipTests compile
cd firefly-connector
mvn spring-boot:run
```

## 3. 启动成功判定

出现以下任一结果即可判断服务已正常起来：

- 控制台显示 Tomcat 监听 `9070`
- `netstat -ano` 中出现 `0.0.0.0:9070 LISTENING`
- 执行：

```bash
curl http://127.0.0.1:9070/actuator/health
```

返回：

```json
{"status":"UP"}
```

## 4. 常见故障排查

### 4.1 报 `BaseMapper` 缺失

典型报错：

```text
NoClassDefFoundError: com/baomidou/mybatisplus/core/mapper/BaseMapper
```

排查方向：

- 确认当前代码包含 `DatabaseDataScopeResolver` 的 `@ConditionalOnClass`
- 确认 `FireflyConnectorApplication` 已排除 `com.songhg.firefly.iot.common.mybatis.scope`
- 重新编译 `firefly-common` 与 `firefly-connector`

### 4.2 报 `DeviceUnregisterRequestDTO` 缺失

典型报错：

```text
ClassNotFoundException: com.songhg.firefly.iot.api.dto.DeviceUnregisterRequestDTO
```

这通常表示：

- 当前 `connector` 运行时拿到的是本地仓库中的旧 `firefly-api` SNAPSHOT
- 或兄弟模块 `target/classes` 尚未更新

处理方式：

```bash
mvn -pl firefly-common,firefly-api,firefly-plugin-api,firefly-connector -am -DskipTests compile
```

然后重新执行启动命令。

## 5. 回滚方式

如需回滚本次治理，需同时回滚以下改动：

- `firefly-common` 中数据权限解析器的装配条件
- `firefly-connector` 启动类的扫描排除
- 父工程及库模块的 `spring-boot:run skip` 配置
- `firefly-connector` 的额外 classpath 配置

不建议只回滚其中一部分，否则很容易重新引入“扫描错误模块”或“命中过期 SNAPSHOT”中的任一类问题。
