# MyBatis SQL 外置化设计说明

## 1. 背景

仓库已新增强制规则：禁止在 Java 代码中通过 `@Select` 内联 SQL，所有 SQL 必须在 `mapper.xml` 中维护。

本次排查发现以下模块仍存在注解 SQL：

- `firefly-device`
- `firefly-support`
- `firefly-system`

## 2. 目标

- 清理源码中的 `@Select` 注解 SQL。
- 将对应查询全部迁移到 `mapper.xml`。
- 保持 Mapper 接口只承担方法声明与参数定义职责。

## 3. 范围

本次治理覆盖以下 Mapper：

- `DeviceMapper`
- `ProductMapper`
- `DeviceLocatorMapper`
- `ProtocolParserDefinitionMapper`
- `ProtocolParserVersionMapper`
- `InAppMessageMapper`
- `RoleMapper`

## 4. 设计原则

- SQL 统一落在 `src/main/resources/mapper/**/*.xml`
- Mapper 接口中保留 `@Param`、`@InterceptorIgnore` 等非 SQL 元信息
- 动态 SQL 使用 XML 标签表达，不再写在 Java 注解字符串中
- 新增 XML 的 `namespace` 必须与 Mapper 全限定类名一致

## 5. 关键取舍

- `ProtocolParserVersionMapper.selectByDefinitionIdAndVersionNoPairs` 使用动态条件查询，迁移后继续用 XML `foreach` 表达，避免 Java 注解脚本继续扩散。
- `DeviceMapper`、`ProductMapper`、`DeviceLocatorMapper` 的租户忽略策略仍通过方法注解保留，避免影响既有多租户行为。

## 6. 风险与应对

- 风险：XML `namespace` 或方法名不匹配导致启动期绑定失败。
  - 应对：编译验证相关模块，并按模块资源路径补齐 XML。
- 风险：多参数方法在 XML 中找不到参数名。
  - 应对：为 `InAppMessageMapper.countUnread` 补充 `@Param`。

