# 设备分组与设备主流程联动运维说明

## 适用模块

- `firefly-device`
- `firefly-web`

## 变更概览

本次变更将设备分组正式接入设备主流程，并将设备分组功能收口为静态分组：

- 设备创建、编辑、导入时维护分组
- 设备删除时自动清理分组成员
- 设备列表支持按分组筛选
- 设备分组页不再暴露动态分组配置入口

## 依赖数据表

- `device_groups`
- `device_group_members`
- `devices`

重点关系说明：

- `device_group_members` 是设备与分组的真实关系表
- `device_groups.device_count` 由服务层在成员变化后回刷

## 发布前检查

### 后端

执行：

```powershell
mvn -pl firefly-device test
```

至少应确认以下测试通过：

- `DeviceGroupServiceTest`
- `DeviceTagServiceTest`
- `MessageRouterServiceTest`

### 前端

执行：

```powershell
cd firefly-web
npm run build
```

## 上线后检查项

### 设备主流程

检查以下操作是否正常：

1. 新建设备后能在设备列表看到所属分组
2. 编辑设备后分组变更立即生效
3. 批量导入设备后，统一分组能正确应用到导入成功的设备
4. 删除设备后，分组详情页成员数量同步减少

### 设备分组页

检查以下行为：

1. 只能创建静态分组
2. 删除父分组后，子分组一并删除
3. 分组页成员列表与设备列表展示一致
4. 设备列表按分组筛选结果与分组成员列表一致

## 常见排查

## 1. 设备列表按分组筛选为空

优先检查：

- `device_group_members` 中是否存在该分组的成员关系
- 分组是否属于当前租户
- 目标设备是否已被逻辑删除

## 2. 删除设备后分组里仍然能看到成员

优先检查：

- 是否经过 `DeviceService.deleteDevice`
- 日志中是否出现 `removeDeviceMemberships` 相关异常
- `device_group_members` 是否仍残留对应 `deviceId`

## 3. 分组数量不准确

优先检查：

- 是否存在绕过 `DeviceGroupService` 的直接写表行为
- `device_groups.device_count` 是否与 `device_group_members` 聚合结果一致

## 日志定位

重点关注：

- `com.songhg.firefly.iot.device.service.DeviceService`
- `com.songhg.firefly.iot.device.service.DeviceGroupService`

关键日志现象：

- `Device created`
- `Device deleted`
- `Device groups deleted`

## 回滚说明

本次改造未新增表结构，不涉及数据库 DDL 回滚。

如需回滚：

1. 回滚应用版本
2. 回滚前端静态资源版本
3. 保留 `device_group_members` 现有数据

注意：

- 回滚后若旧版本仍暴露动态分组入口，可能再次出现页面行为与服务能力不一致的问题
- 因此更建议在完成全链路验证后再发布
