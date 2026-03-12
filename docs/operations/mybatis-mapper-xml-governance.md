# MyBatis SQL 外置化运维说明

## 1. 模块说明

本说明用于约束和排查 MyBatis Mapper SQL 的维护方式：

- Java Mapper 接口中禁止使用 `@Select`
- SQL 必须维护在 `mapper.xml`

## 2. 资源目录

本次新增或维护的 XML 路径：

- `firefly-device/src/main/resources/mapper/device/`
- `firefly-device/src/main/resources/mapper/device/protocolparser/`
- `firefly-support/src/main/resources/mapper/support/`
- `firefly-system/src/main/resources/mapper/system/`

## 3. 配置要求

相关模块均通过以下配置加载 XML：

- `mybatis-plus.mapper-locations=classpath:mapper/**/*.xml`

新增 Mapper XML 时必须放在该扫描范围下。

## 4. 自检方式

### 4.1 规则排查

执行源码检索，确认没有 `@Select`：

```powershell
Get-ChildItem -Recurse -File -Include *.java |
  Select-String -Pattern '@Select\b|import org\.apache\.ibatis\.annotations\.Select'
```

### 4.2 编译验证

```powershell
mvn -pl firefly-device,firefly-support,firefly-system -am compile -DskipTests
```

## 5. 常见故障

### 5.1 启动时报找不到 statement

排查：

- 检查 XML `namespace` 是否与 Mapper 全限定名一致
- 检查 `<select id="">` 是否与方法名一致
- 检查 XML 是否位于 `classpath:mapper/**/*.xml` 扫描路径下

### 5.2 多参数绑定失败

排查：

- 检查方法参数是否显式声明 `@Param`
- 检查 XML 中引用名是否与 `@Param` 一致

## 6. 回滚方式

- 如需回滚，直接回退本次 Mapper Java 和 XML 变更即可
- 回滚后仍需注意仓库规则不允许重新引入 `@Select`

