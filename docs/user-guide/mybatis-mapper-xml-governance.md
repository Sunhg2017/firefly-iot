# MyBatis Mapper XML 维护说明

## 1. 适用角色

- 后端开发
- 代码评审人员

## 2. 使用规则

### 2.1 新增查询时

1. 在 Mapper 接口中声明方法。
2. 如有多参数，补充 `@Param`。
3. 在对应 `mapper.xml` 中新增 `<select>` / `<update>` / `<delete>` / `<insert>`。
4. 保证 `namespace` 与方法名一一对应。

### 2.2 修改查询时

1. 优先修改 `mapper.xml` 中的 SQL。
2. 不要把 SQL 挪回 Java 注解。
3. 动态条件、联表、聚合、分页都使用 XML 标签表达。

## 3. 示例

### 3.1 Mapper 接口

```java
List<String> findActiveRoleCodesByUserId(@Param("userId") Long userId);
```

### 3.2 Mapper XML

```xml
<select id="findActiveRoleCodesByUserId" resultType="string">
    SELECT DISTINCT r.code
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE u.id = #{userId}
</select>
```

## 4. 注意事项

- 不允许在 Java 类里写 `@Select`
- 多参数方法必须检查 `@Param`
- 动态 SQL 必须使用 XML 的 `if`、`foreach` 等标签
- 新增 XML 后要确认落在 `mapper/**/*.xml` 扫描路径下

