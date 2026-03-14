# 设备分组动态成员运维说明

## 适用模块

- `firefly-device`
- `firefly-web`

## 功能概览

本次变更为设备分组补齐了动态成员能力：

- 动态分组支持规则驱动的自动入组和出组
- 设备变化后会自动重算动态成员
- 设备分组页面支持图形化配置动态规则

## 关键数据表

- `device_groups`
- `device_group_members`
- `devices`

说明：

- `device_group_members` 同时承载静态成员和动态成员
- `device_groups.type` 用于区分静态分组和动态分组
- `device_groups.dynamic_rule` 保存结构化规则 JSON

## 自动维护触发点

以下动作会触发动态分组成员重算：

- 设备标签绑定变化
- 设备启用
- 设备禁用
- 设备在线状态变化
- 动态分组创建
- 动态分组编辑

## 验证方式

### 后端

```powershell
mvn -pl firefly-device test
```

重点关注：

- `DeviceGroupServiceTest`
- `DeviceTagServiceTest`
- `DeviceServiceTest`

### 前端

```powershell
cd firefly-web
npm run build
```

## 上线后检查项

1. 新建动态分组后，符合规则的设备能立即进入分组
2. 修改设备标签后，动态分组成员会自动变化
3. 设备上线或离线后，基于在线状态的动态分组会自动更新
4. 设备列表按动态分组筛选时结果正确

## 常见排查

## 1. 动态分组没有成员

优先检查：

- `device_groups.dynamic_rule` 是否为合法 JSON
- `device_groups.type` 是否为 `DYNAMIC`
- 设备是否已被逻辑删除
- 规则里使用的 `productKey`、标签键值是否真实存在

## 2. 修改标签后动态分组未变化

优先检查：

- 标签操作是否经过 `DeviceTagService`
- `devices.tags` 快照是否已更新
- 日志中是否有动态规则解析异常

## 3. 在线状态规则不生效

优先检查：

- 设备上下线消息是否正常进入 `DeviceService.updateRuntimeConnectionState`
- `devices.online_status` 是否已更新
- 动态规则中的 `onlineStatus` 是否填写为 `ONLINE`、`OFFLINE` 或 `UNKNOWN`

## 日志定位

重点关注：

- `com.songhg.firefly.iot.device.service.DeviceGroupService`
- `com.songhg.firefly.iot.device.service.DeviceTagService`
- `com.songhg.firefly.iot.device.service.DeviceService`

## 回滚说明

本次改造没有新增表结构。

如需回滚：

1. 回滚应用版本
2. 回滚前端静态资源
3. 保留现有 `device_group_members` 数据

注意：

- 回滚后如果旧版本不识别动态规则，动态成员可能停止自动维护
