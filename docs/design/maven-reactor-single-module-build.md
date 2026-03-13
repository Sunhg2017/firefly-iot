# Maven 单模块 Reactor 构建设计说明

## 1. 背景

在仓库根目录执行 `mvn -pl firefly-device -Dtest=ProtocolParserServiceTest test` 时，`ProtocolParserServiceTest` 曾出现 `ParserStatus`、`AppContextHolder` 类缺失。

排查结果表明，问题并非 `firefly-device` 源码缺类，而是单模块执行时命中了本地仓库中过期的内部 `SNAPSHOT` 依赖，未将 `firefly-common` 等上游模块重新纳入本次 reactor 构建。

## 2. 目标

- 根目录下的单模块 Maven 命令默认带上所需上游模块，避免命中过期内部依赖。
- 保持 `-Dtest=...` 仅运行目标模块测试时，其他被 `--also-make` 带入的模块不会因为“未命中指定测试”而失败。
- 保持 `ProtocolParserServiceTest` 自身用例稳定，消除与本次执行路径无关的冗余 stub。

## 3. 范围

本次设计覆盖：

- 根目录 `.mvn/maven.config`
- 父工程 `pom.xml` 的 surefire 统一配置
- `firefly-device` 中 `ProtocolParserServiceTest` 的测试桩清理

不涉及业务协议解析逻辑、运行时类加载器实现或生产部署方式调整。

## 4. 方案

### 4.1 默认启用 `--also-make`

在根目录新增 `.mvn/maven.config`，写入 `--also-make`。

效果：

- 开发者继续使用 `mvn -pl firefly-device ...` 这类命令即可。
- Maven 会自动把 `firefly-device` 依赖的仓库内上游模块一起纳入 reactor。
- `ParserStatus`、`AppContextHolder` 等来自上游模块的类将优先使用本次 reactor 构建产物，而不是本地仓库中的旧快照。

### 4.2 统一关闭“指定测试未命中即失败”

父工程统一配置 `maven-surefire-plugin`：

- `failIfNoSpecifiedTests=false`

原因：

- 当命令带 `-Dtest=ProtocolParserServiceTest` 时，真正命中测试的只有 `firefly-device`。
- 上游模块因 `--also-make` 被带入 reactor，但通常没有同名测试。
- 若不关闭该开关，upstream 模块会在 surefire 阶段因“未找到指定测试”直接失败，抵消 `--also-make` 的收益。

### 4.3 清理冗余 Mockito stub

`ProtocolParserServiceTest.rollbackShouldRestoreSnapshotAndAdvanceDraftVersion` 中存在未被使用的 `mockProduct(...)`，在新的执行链路下会触发 `UnnecessaryStubbingException`。

本次直接删除该无效 stub，保持回滚测试仅依赖本用例真正使用的数据准备。

## 5. 关键取舍

- 选择仓库级 `.mvn/maven.config`，而不是要求每位开发者记忆 `-am`：
  - 可以把正确执行路径固化到仓库，减少人为遗漏。
- 选择 surefire 容忍 upstream “未命中指定测试”：
  - 只放宽带 `-Dtest=...` 的跨模块执行场景，不影响目标模块内真实测试失败的暴露。
- 不修改业务代码绕开缺类：
  - 根因在构建路径，不在协议解析服务本身。

## 6. 风险与应对

- 风险：部分开发者可能未意识到仓库默认启用了 `--also-make`，单模块命令耗时会比纯隔离模块略长。
  - 应对：在运维说明和使用说明中明确根目录执行语义。
- 风险：误把类缺失问题理解为生产运行时缺包。
  - 应对：文档明确这是本地测试场景下的 reactor 构建问题。

## 7. 验证

已验证以下命令通过：

```bash
mvn -pl firefly-device -Dtest=ProtocolParserServiceTest test
mvn -pl firefly-device -DskipTests compile
```
