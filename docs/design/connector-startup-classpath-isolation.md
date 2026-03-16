# Connector 启动类路径隔离设计说明

## 1. 背景

`firefly-connector` 不依赖 MyBatis Plus，也不应该装配租户数据权限的数据库解析器。
本次排障中出现了两类启动失败：

- `com.baomidou.mybatisplus.core.mapper.BaseMapper` 缺失，导致 `DatabaseDataScopeResolver` 及其 Mapper 在 `connector` 启动时被错误解析。
- `DeviceUnregisterRequestDTO` 缺失，原因是单独在 `firefly-connector` 模块目录执行 `mvn spring-boot:run` 时，Maven 命中了本地仓库中过期的 `firefly-api` SNAPSHOT。

## 2. 目标

- 让 `firefly-connector` 启动时彻底跳过 `common.mybatis.scope` 下的 MyBatis 数据权限实现。
- 让根目录 reactor 启动 `connector` 时只运行真正可启动的应用模块，不再把父工程和库模块当 Spring Boot 应用执行。
- 让 `firefly-connector` 在模块目录内执行 `mvn spring-boot:run` 时，优先使用工作区里刚编译出的兄弟模块类。

## 3. 范围

本次仅调整以下内容：

- `firefly-common` 数据权限解析器的装配条件
- `firefly-connector` 启动类的组件扫描范围
- Maven `spring-boot:run` 对父工程、库模块和 `connector` 的 classpath/skip 策略

不涉及：

- 业务接口、协议解析、设备认证逻辑
- 数据库结构和菜单权限台账

## 4. 方案

### 4.1 非 MyBatis 模块不装配数据库数据权限解析器

`DatabaseDataScopeResolver` 增加：

- `@ConditionalOnClass(name = "com.baomidou.mybatisplus.core.mapper.BaseMapper")`

这样没有 MyBatis Plus 的模块不会继续尝试装配该解析器。

### 4.2 Connector 显式排除 `common.mybatis.scope`

`FireflyConnectorApplication` 保留对 `com.songhg.firefly.iot.common` 的公共能力扫描，但增加组件扫描排除规则：

- 排除 `com.songhg.firefly.iot.common.mybatis.scope..*`

这样 `connector` 不会再把数据库数据权限相关实体、Mapper、解析器纳入自己的 Spring 容器。

### 4.3 Reactor 启动时只运行可启动模块

为以下非应用模块显式配置 `spring-boot-maven-plugin` 的 `skip=true`：

- 根工程 `firefly-iot`
- `firefly-common`
- `firefly-api`
- `firefly-plugin-api`

这样在仓库根目录执行：

```bash
mvn -pl firefly-connector -am -DskipTests spring-boot:run
```

Maven 仍会把上游模块纳入 reactor 并完成编译，但不会尝试把库模块当成 Spring Boot 应用启动。

### 4.4 模块目录启动优先使用工作区最新类

在 `firefly-connector` 的 `spring-boot-maven-plugin` 中补充：

- `firefly-common/target/classes`
- `firefly-api/target/classes`
- `firefly-plugin-api/target/classes`

作为 `additionalClasspathElements`。

这样当本地 Maven 仓库中的 SNAPSHOT 比工作区旧时，`connector` 开发态启动会优先使用当前仓库刚编译出的类，避免再次出现 `DeviceUnregisterRequestDTO` 这类“源码有、运行时缺”的问题。

## 5. 关键取舍

- 没有给 `connector` 补 MyBatis Plus 依赖兜底，因为这会把不属于该模块的持久层能力硬塞进协议接入层。
- 没有继续保留“扫描后再失败”的路径，而是直接在扫描和装配两个层面都做隔离。
- 没有要求开发人员手工记忆每次先 `install` 上游模块，而是把 root reactor 启动和本地 classpath 优先级固化到仓库配置。

## 6. 风险与约束

- 模块目录直接执行 `mvn spring-boot:run` 时，兄弟模块的 `target/classes` 需要至少存在一次有效编译产物。
- 推荐优先在根目录执行 reactor 命令，以保证依赖模块总是与当前工作区源码一致。

## 7. 验证

已完成验证：

```bash
mvn -pl firefly-common,firefly-connector -am -DskipTests compile
cd firefly-connector && mvn spring-boot:run
```

验证结果：

- 已越过原先的 `BaseMapper` 类加载失败
- `connector` 成功监听 `9070`
- `http://127.0.0.1:9070/actuator/health` 返回 `{"status":"UP"}`
