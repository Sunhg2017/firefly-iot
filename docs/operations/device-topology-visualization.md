# 设备拓扑可视化运维说明
> 模块: `firefly-device` / `firefly-web` / `firefly-system`
> 日期: 2026-03-22
> 状态: Done

## 1. 适用范围

用于设备拓扑页面的发布验证、菜单迁移检查、异常排查和回滚处理。

## 2. 发布内容

- 新增后端接口 `POST /api/v1/devices/topology`
- 新增前端页面 `/device-topology`
- 新增租户菜单 `device-topology`
- 新增 Flyway SQL：`V32__add_device_topology_menu.sql`

## 3. 发布前检查

### 3.1 后端

```bash
mvn -pl firefly-device -Dtest=DeviceServiceTest test
```

通过标准：

- `DeviceServiceTest` 全部通过
- 祖先链路和后代链路补齐逻辑没有回归

### 3.2 前端

```bash
cd firefly-web
npm run build
```

通过标准：

- TypeScript 编译通过
- Vite 构建成功
- 产物中包含 `DeviceTopologyPage` 对应 chunk

### 3.3 菜单迁移

确认 `firefly-system` 已执行 `V32__add_device_topology_menu.sql`。

建议检查：

```sql
select workspace_scope, menu_key, route_path, parent_menu_key
from workspace_menu_catalog
where menu_key = 'device-topology';

select workspace_scope, menu_key, permission_code
from workspace_menu_permission_catalog
where menu_key = 'device-topology';
```

预期结果：

- `workspace_menu_catalog` 中存在 `TENANT/device-topology`
- `workspace_menu_permission_catalog` 中存在 `TENANT/device-topology/device:read`

## 4. 发布后回归

### 4.1 页面入口

1. 登录租户空间
2. 打开“设备资产”
3. 确认菜单中出现“设备拓扑”
4. 进入“设备管理”，确认页头存在“设备拓扑”入口

### 4.2 基本功能

1. 打开“设备拓扑”
2. 按产品、分组、在线状态筛选
3. 确认页面可以展示：
   - 拓扑链路
   - 独立设备
   - 断链设备
4. 点击任一节点，确认右侧详情正常显示

### 4.3 关系校验

重点核对以下场景：

- 命中子设备时，页面仍能展示其上级网关
- 命中网关时，页面仍能展示该网关下的子设备
- 断链设备不会混入普通拓扑根节点

## 5. 常见问题

### 5.1 菜单没有出现

排查顺序：

1. 确认 `V32` 已执行
2. 确认角色具备 `device:read`
3. 确认租户菜单配置未显式屏蔽 `device-topology`

### 5.2 页面提示设备数超过 3000

说明当前拓扑范围过大。处理方式：

1. 先按产品筛选
2. 再按分组或项目筛选
3. 再进入拓扑页查看

不要在代码里放宽保护阈值绕过此问题，应先缩小业务范围。

### 5.3 节点显示为断链

优先排查：

1. 上级设备是否已被删除
2. 上级设备是否不在当前项目范围内
3. 上级设备是否因权限或数据范围不可见
4. `devices.gateway_id` 是否写入了错误值

## 6. 回滚说明

如需回滚本次能力：

1. 回滚前端到上一可用版本
2. 回滚 `firefly-device` 到上一可用版本
3. 如需隐藏菜单，可执行定向 SQL 清理：

```sql
delete from workspace_menu_permission_catalog
where workspace_scope = 'TENANT' and menu_key = 'device-topology';

delete from workspace_menu_catalog
where workspace_scope = 'TENANT' and menu_key = 'device-topology';
```

如果历史环境已经被角色或租户配置引用，还需要同步清理相关菜单配置脏数据。
