# Maven 单模块 Reactor 构建使用说明

## 1. 适用角色

- 后端开发
- 测试开发
- 本地排障人员

## 2. 使用目的

当你只想验证某一个模块，例如 `firefly-device`，但该模块依赖仓库内其他模块的最新源码产物时，直接在仓库根目录执行单模块命令即可，无需再手工补 `-am`。

## 3. 使用步骤

### 3.1 运行 `ProtocolParserServiceTest`

```bash
mvn -pl firefly-device -Dtest=ProtocolParserServiceTest test
```

预期结果：

- Maven 会自动构建所需上游模块
- `ProtocolParserServiceTest` 正常执行
- 不再出现 `ParserStatus`、`AppContextHolder` 缺失

### 3.2 运行单模块编译

```bash
mvn -pl firefly-device -DskipTests compile
```

适用于只检查当前模块及其上游依赖是否能正常编译。

## 4. 注意事项

- 请从仓库根目录执行命令
- 不需要额外手工拼接 `-am`，仓库默认已经启用 `--also-make`
- 如果你显式指定了其他 Maven 配置文件或关闭了默认配置，可能会重新遇到旧快照依赖问题
- `-Dtest=...` 只会运行目标模块中命中的测试；被自动带入的上游模块不会因为未命中同名测试而失败

## 5. 常见问答

### 5.1 为什么明明只测 `firefly-device`，还会编译其他模块？

因为 `firefly-device` 依赖仓库内其他模块的最新源码产物，自动带上上游模块可以避免误用本地仓库中的过期 `SNAPSHOT`。

### 5.2 如果还是报类缺失怎么办？

先确认你是在仓库根目录执行，并检查 `.mvn/maven.config` 是否还在；如果仓库默认配置被绕过，Maven 仍可能退回到旧依赖。
