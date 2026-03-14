# 设备分组动态成员设计

## 背景

设备分组此前只支持静态维护，虽然保留过动态分组字段，但没有真正的执行链路。结果是：

- 前端无法稳定配置动态规则
- 后端不会在设备变化后自动重算成员
- 动态分组即使存在数据，也无法保证成员关系和设备现状一致

本次改造把动态分组补成真正可运行的能力。

## 目标

- 支持静态分组和动态分组并存
- 动态分组规则使用结构化 JSON 持久化
- 当设备字段、状态、在线状态、标签变化时自动维护分组成员
- 前端提供步骤式抽屉和选择式规则构建器，避免用户手写规则

## 规则模型

动态规则存储在 `device_groups.dynamic_rule`，结构如下：

```json
{
  "matchMode": "ALL",
  "conditions": [
    {
      "field": "productKey",
      "operator": "IN",
      "values": ["pk_gateway"]
    },
    {
      "field": "onlineStatus",
      "operator": "EQ",
      "value": "ONLINE"
    },
    {
      "field": "tag",
      "operator": "HAS_TAG",
      "tagKey": "region",
      "tagValue": "north"
    }
  ]
}
```

### 支持字段

- `productKey`
- `deviceName`
- `nickname`
- `status`
- `onlineStatus`
- `tag`

### 支持操作符

- `productKey`: `EQ` / `IN`
- `deviceName`: `EQ` / `CONTAINS` / `PREFIX`
- `nickname`: `EQ` / `CONTAINS` / `PREFIX`
- `status`: `EQ`
- `onlineStatus`: `EQ`
- `tag`: `HAS_TAG`

## 核心实现

## 1. 动态成员仍落到 `device_group_members`

没有新建动态成员专用表，而是继续复用 `device_group_members`：

- 静态分组成员由人工维护
- 动态分组成员由系统自动维护

这样设备列表、分组成员页、分组计数和按分组筛选都能复用现有链路。

## 2. 设备变化后重算动态分组

新增 `DeviceGroupService.rebuildDynamicGroupsForDevice(deviceId)`，在以下场景触发：

- 设备标签变化
- 设备启用
- 设备禁用
- 设备在线状态变化

同时，设备创建和设备编辑流程会经过标签同步链路，因此也会触发动态分组重算。

## 3. 动态分组创建/编辑后全量回刷

创建或编辑动态分组时：

1. 解析并校验动态规则
2. 扫描当前租户下的有效设备
3. 重新生成该动态分组的成员关系
4. 回刷 `device_count`

如果分组从动态改为静态，则清空原有自动成员，避免残留错误状态。

## 4. 标签匹配使用设备标签快照

动态规则中的标签条件不直接依赖前端传入，而是读取设备当前标签快照 `devices.tags`。  
该快照由 `DeviceTagService` 在标签绑定变化后同步刷新，从而保证动态分组命中的标签信息与设备展示保持一致。

## 前端设计

- 分组编辑改为步骤式抽屉
- 步骤分为：
  - 基础信息
  - 匹配规则
  - 预览确认
- 动态规则配置尽量使用下拉、多选和标签选择
- 提交前展示只读 JSON 预览，便于排查

## 测试

新增或补强的测试包括：

- `DeviceGroupServiceTest`
  - 静态成员同步
  - 动态规则命中后自动入组
  - 分组递归删除
- `DeviceTagServiceTest`
  - 标签同步后触发动态分组重算
- `DeviceServiceTest`
  - 启用设备和在线状态变更后触发动态分组重算
