# Connector 启动使用说明

## 1. 适用角色

适用于需要本地启动 `firefly-connector` 的开发、联调和排障人员。

## 2. 最稳妥的启动方法

在仓库根目录执行：

```bash
mvn -pl firefly-connector -am -DskipTests spring-boot:run
```

这样 Maven 会自动把 `connector` 依赖的公共模块一起编译，并只启动真正的应用模块。

## 3. 如果你只想在模块目录里启动

先执行一次编译：

```bash
mvn -pl firefly-common,firefly-api,firefly-plugin-api,firefly-connector -am -DskipTests compile
```

再进入模块目录：

```bash
cd firefly-connector
mvn spring-boot:run
```

## 4. 怎么判断已经启动成功

默认端口：

- HTTP: `9070`
- MQTT: `1883`
- CoAP: `5683/udp`

健康检查：

```bash
curl http://127.0.0.1:9070/actuator/health
```

看到：

```json
{"status":"UP"}
```

说明 `connector` 已正常运行。

## 5. 常见报错怎么理解

### 5.1 `BaseMapper` 缺失

这不是让你给 `connector` 补数据库依赖，而是说明它错误扫描到了只属于 MyBatis 业务服务的数据权限组件。

### 5.2 `DeviceUnregisterRequestDTO` 缺失

这通常不是源码里没有这个类，而是启动时拿到了一份过期的 `firefly-api` SNAPSHOT。
先重新执行上面的 compile 命令，再启动即可。
