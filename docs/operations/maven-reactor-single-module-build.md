# Maven 单模块 Reactor 构建运维说明

## 1. 适用场景

适用于在仓库根目录执行单模块编译、打包、测试时的本地开发与 CI 排障，尤其是内部模块之间存在 `SNAPSHOT` 依赖的场景。

## 2. 当前约束

- 根目录 `.mvn/maven.config` 默认启用了 `--also-make`
- 父工程 surefire 默认启用了 `failIfNoSpecifiedTests=false`

因此执行：

```bash
mvn -pl firefly-device -Dtest=ProtocolParserServiceTest test
```

时，会自动把 `firefly-device` 依赖的上游内部模块一起纳入 reactor，但只真正运行 `firefly-device` 中命中的测试类。

## 3. 推荐执行方式

### 3.1 执行指定测试

```bash
mvn -pl firefly-device -Dtest=ProtocolParserServiceTest test
```

### 3.2 仅验证编译

```bash
mvn -pl firefly-device -DskipTests compile
```

## 4. 常见故障排查

### 4.1 报 `ParserStatus` / `AppContextHolder` 缺失

优先检查：

- 是否在仓库根目录执行命令
- `.mvn/maven.config` 是否仍包含 `--also-make`
- 命令是否绕过了仓库默认配置，例如显式覆盖了 Maven 配置目录

说明：

- 该问题通常表示 Maven 未把 `firefly-common` 等上游模块纳入当前 reactor，而是回退到了本地仓库中的旧 `SNAPSHOT`

### 4.2 报 “No tests matching pattern”

优先检查父工程 `pom.xml` 中 `maven-surefire-plugin` 是否仍保留：

```xml
<failIfNoSpecifiedTests>false</failIfNoSpecifiedTests>
```

若被移除，`--also-make` 带入的上游模块会因为未命中 `-Dtest` 指定类而直接失败。

### 4.3 报 Mockito `UnnecessaryStubbingException`

优先检查目标测试是否引入了未被实际调用的 stub，尤其是跨服务或回滚场景下的 `mockProduct(...)`、`when(...).thenReturn(...)` 之类冗余准备。

## 5. 回滚方式

若需回滚本次构建策略，需同时回滚以下内容：

- `.mvn/maven.config` 中的 `--also-make`
- 父工程 `pom.xml` 中 surefire 的 `failIfNoSpecifiedTests=false`
- 对应测试中的冗余 stub 清理

不建议仅部分回滚，否则容易重新出现“类缺失”和“指定测试未命中即失败”两类不一致状态。
