# 设备管理与设备影子界面优化设计说明
> 模块: `firefly-web`
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备管理页与设备影子页此前存在两类主要问题：

- 页面中文文案存在乱码，影响理解和使用。
- 设备影子页虽然业务上只允许维护 `desired`，但 `reported`、`delta`、`metadata` 依旧使用与可编辑区域相同的编辑器视觉，容易让用户误以为也能修改。

此外，前端 API 与后端控制器仍保留了用户侧 `reported` 手工更新入口，这与设备影子的职责边界不一致。

## 2. 目标

- 明确设备影子中哪些内容可编辑，哪些内容只读。
- 将只读区域做成明显的“查看态”，避免误操作预期。
- 修复设备影子页和抽屉中的中文乱码。
- 收敛用户侧 `reported` 更新入口，保持前后端语义一致。

## 3. 设计方案

### 3.1 编辑权限边界

- `desired`
  - 平台维护的期望状态。
  - 允许用户在页面中编辑、保存、清空。
- `reported`
  - 设备运行时上报的实际状态。
  - 页面只读，不允许人工修改。
- `delta`
  - 系统根据 `desired - reported` 自动计算出的差异。
  - 页面只读。
- `metadata`
  - 系统维护的字段来源、更新时间等元数据。
  - 页面只读。

### 3.2 前端交互调整

- `CodeEditorField` 增加只读态主题和只读标识：
  - 浅色只读背景
  - 右上角只读标签
  - 关闭只读区域的补全与格式化触发
- 设备影子独立页与抽屉增加统一的编辑说明：
  - 明确“只有 Desired 可以编辑”
  - 明确只读区域仅供查看和复制
- `desired` 在未进入编辑状态时同样展示“查看态”，避免静态浏览时误认为可直接输入。

### 3.3 接口语义收口

- 删除前端 `deviceApi.updateReported(...)` 遗留方法。
- 删除 `DeviceShadowController` 中用户侧 `PUT /devices/{deviceId}/shadow/reported` 接口。
- `DeviceShadowService.updateReported(...)` 继续保留，作为设备消息链路内部能力，由消息路由等运行时服务调用。

## 4. 影响范围

- `firefly-web/src/components/CodeEditorField.tsx`
- `firefly-web/src/pages/device-shadow/DeviceShadowPage.tsx`
- `firefly-web/src/pages/device/DeviceShadowDrawer.tsx`
- `firefly-web/src/services/api.ts`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/controller/DeviceShadowController.java`
- `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/DeviceShadowService.java`

## 5. 设计取舍

- 没有继续保留用户手工写 `reported` 的能力，因为这会破坏设备影子的职责边界，也会让页面语义变得混乱。
- 没有把只读区域替换成普通文本框，而是继续保留 Monaco 编辑器，原因是用户仍然需要语法高亮、折叠和复制体验，只是视觉与能力上明确收口为只读。
