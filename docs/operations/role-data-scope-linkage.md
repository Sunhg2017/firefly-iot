# 角色数据范围联动运维说明

## 1. 变更内容

本次上线后，角色数据范围从“仅保存枚举”改为“角色配置直接驱动多服务过滤”：

- 角色页会保存项目范围 / 设备分组范围
- `system / device / rule / media` 服务统一启用公共数据范围解析器
- 项目、产品、设备三类资源会被统一收口

## 2. 上线步骤

1. 发布 `firefly-common`
2. 依次发布 `firefly-system`
3. 依次发布 `firefly-device`
4. 依次发布 `firefly-rule`
5. 依次发布 `firefly-media`
6. 发布 `firefly-web`

## 3. 历史数据清理

本次改造后，旧的 `user_roles.project_id` 不再作为数据范围来源。若历史环境里已经写入过这类数据，需要在上线窗口内排查并清理：

```sql
SELECT id, user_id, role_id, project_id
FROM user_roles
WHERE project_id IS NOT NULL;
```

处理原则：

- 将对应项目范围迁移到 `roles.data_scope_config.projectIds`
- 清空 `user_roles.project_id`
- 避免继续依赖旧字段解释访问范围

## 4. 验证步骤

### 4.1 编译验证

```bash
mvn -pl firefly-common,firefly-system,firefly-device,firefly-rule,firefly-media -am -DskipTests compile
cd firefly-web && npm run build
```

### 4.2 功能验证

1. 使用租户管理员进入角色管理
2. 新建 `PROJECT` 角色，选择 1 个项目并保存
3. 用该角色账号验证：
   - 项目列表仅看到选中项目
   - 产品、设备、规则、告警、OTA、视频仅看到对应范围数据
4. 新建 `GROUP` 角色，选择 1 个设备分组范围并保存
5. 用该角色账号验证：
   - 设备列表仅看到分组成员设备
   - 产品、告警、规则、OTA、视频仅看到由该分组设备反推出来的范围
6. 新建 `CUSTOM` 角色，同时选择项目和设备分组，验证结果为合并后的可见范围
7. 新建空范围角色时，确认前后端都直接拦截保存

## 5. 常见排查

### 5.1 角色有范围配置，但业务页仍看到全量数据

重点检查：

- 对应服务是否已升级到本次版本
- 对应服务启动类的 `@MapperScan` 是否包含 `com.songhg.firefly.iot.common.mybatis.scope`
- 当前用户是否仍持有 `ALL` 角色

### 5.2 角色页无法加载项目或设备分组选项

重点检查：

- 当前操作员是否具备项目读取、设备分组读取能力
- `SYSTEM` 与 `DEVICE` 服务是否正常可用
- 浏览器网络面板中 `/projects/list`、`/device-groups/all` 是否返回 200

### 5.3 `GROUP` 角色看不到任何数据

重点检查：

- 设备分组下是否有成员设备
- 分组成员设备是否已被逻辑删除
- 对应设备的 `project_id`、`product_id` 是否为空

## 6. 回滚说明

如需回滚，必须整组回滚：

- `firefly-common`
- `firefly-system`
- `firefly-device`
- `firefly-rule`
- `firefly-media`
- `firefly-web`

禁止只回滚单个业务服务，否则会出现解析器、注解列配置与前端表单口径不一致的问题。
