# 设备分组模块运维说明

> 版本: v1.0.0
> 日期: 2026-03-13
> 状态: Done

## 1. 适用范围

本文档用于设备分组模块的发布验证、日常巡检、故障排查与回滚处理，覆盖前端页面与 `firefly-device` 服务端接口行为。

## 2. 本次优化后的运行特征

- 设备分组页采用“总览 + 分组目录 + 分组画像 + 分组成员”的布局。
- 静态分组成员维护依赖设备列表远程搜索，不再允许页面手工输入设备 ID。
- 动态分组成员区域只读，出现“不可手工维护成员”提示是正常行为。
- 更新分组时已经支持修改分组类型和父分组。

## 3. 依赖与接口

### 3.1 前端依赖

- 页面文件：`firefly-web/src/pages/device-group/DeviceGroupPage.tsx`
- 依赖接口：
  - `deviceGroupApi.tree()`
  - `deviceGroupApi.update(...)`
  - `deviceGroupApi.listDevices(groupId)`
  - `deviceGroupApi.addDevice(groupId, deviceId)`
  - `deviceGroupApi.removeDevice(groupId, deviceId)`
  - `deviceApi.list(...)`

### 3.2 后端依赖

- 服务模块：`firefly-device`
- 关键类：
  - `DeviceGroupController`
  - `DeviceGroupService`
  - `DeviceMapper`
  - `ProductMapper`

## 4. 发布与回归检查

### 4.1 前端回归

执行：

```bash
cd firefly-web
npm run build
```

重点确认：

- 设备分组页面能正常打开
- 左侧分组树支持搜索和展开
- 静态分组可通过下拉搜索设备加入成员
- 动态分组只显示规则和只读说明
- 页面不再展示父分组 ID 或设备 ID 作为主信息

### 4.2 后端回归

执行：

```bash
mvn -pl firefly-device -am test -DskipITs
```

重点确认：

- 更新分组时 `type`、`parentId` 能成功生效
- 父分组不能设置为自己或自己的子孙节点
- 动态分组调用手工加减成员接口时会被拒绝
- 成员列表能返回设备名称、产品名称、`productKey`、设备状态、在线状态

## 5. 常见问题排查

### 5.1 页面看不到可加入设备

排查顺序：

1. 确认当前选中的是静态分组，不是动态分组。
2. 确认 `/devices/list` 在当前租户下能返回设备数据。
3. 确认待加入设备没有已经属于当前分组。
4. 查看浏览器网络请求中 `keyword`、`pageNum`、`pageSize` 是否正常。

### 5.2 分组成员列表为空

可能原因：

- 当前分组本来没有成员
- 当前分组为动态分组，页面不会提供手工成员表
- 设备已删除，历史成员关系存在但无法补齐设备信息

建议先确认分组类型，再检查 `device_group_members` 与设备主表数据。

### 5.3 更新分组时报“上级分组不能选择当前分组的子孙节点”

说明本次提交触发了父子层级防环校验。需要重新选择父分组，保证目录树仍然是有向无环结构。

### 5.4 动态分组不能加设备

这是设计后的正常行为，不属于故障。动态分组成员由规则归集，不允许手工维护。

### 5.5 页面仍显示旧布局

优先排查：

- 前端静态资源是否已更新
- 浏览器是否命中旧缓存
- 部署环境是否仍引用旧版 `DeviceGroupPage` 打包产物

## 6. 日志定位建议

- 前端：浏览器控制台、网络面板
- 后端：`firefly-device` 应用日志

建议关注关键报错：

- “上级分组不存在”
- “上级分组不能选择自身”
- “上级分组不能选择当前分组的子孙节点”
- “动态分组仅维护规则，不支持手动添加或移除设备”
- “设备不存在或已被删除”

## 7. 回滚说明

如果需要回滚本次优化，需同时回滚以下文件：

- `firefly-web/src/pages/device-group/DeviceGroupPage.tsx`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/controller/DeviceGroupController.java`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceGroupService.java`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/dto/devicegroup/DeviceGroupUpdateDTO.java`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/dto/devicegroup/DeviceGroupMemberVO.java`
- `docs/design/detailed-design-device-group-management.md`
- `docs/operations/device-group-management-operations.md`
- `docs/user-guide/device-group-management-guide.md`

回滚后必须重新执行前端构建和 `firefly-device` 模块测试。
