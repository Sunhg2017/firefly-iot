# 设备模拟器分步创建设备保值修复设计说明
> 模块: firefly-simulator
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备模拟器的“新建设备”改造成抽屉分步表单后，步骤切换会卸载上一阶段的表单项。末步如果直接调用 `form.validateFields()`，Ant Design 只会返回当前挂载字段，导致前两步已经填写的 `ProductKey`、`DeviceName`、`DeviceSecret` 等接入参数没有进入最终创建设备请求。

## 2. 现象

- 创建设备成功后，访问概览中三元组字段为空或显示待补充。
- 系统日志出现“新增模拟设备：undefined”。
- HTTP、MQTT、CoAP 等协议在刚创建后即无法直接连接，因为认证参数实际未保存。

## 3. 修复方案

- 创建设备时按协议聚合三步涉及的全部字段，统一执行校验，而不是只校验最后一步当前挂载字段。
- 校验完成后使用 `form.getFieldsValue(true)` 读取完整表单存储，确保已卸载步骤的值仍可参与提交。
- `nickname` 在提交阶段直接同步为模拟器名称，避免动态注册和日志场景出现空昵称，也避免表单重复录入。
- 抽屉底部“创建设备”按钮统一改为走新的 `handleCreateDevice` 提交流程，旧的局部提交流程移除。

## 4. 影响范围

- `firefly-simulator/src/components/AddDeviceModal.tsx`

## 5. 风险与约束

- 该修复依赖 `getStepFields` 返回值与页面实际字段保持同步，后续新增协议字段时必须同步更新步骤字段映射。
- 抽屉继续使用分步渲染，没有改成整表单常驻渲染，因此最终提交仍必须保持“全字段校验 + 全表单取值”的模式。

## 6. 2026-03-14 摘要展示补充

- 第三步“配置摘要”补充单独的 `DeviceName / 设备名称` 展示项，避免 HTTP 设备在最终确认阶段只能看到 `ProductKey`、看不到设备名称。

## 7. 2026-03-25 视频 DeviceName 自动映射补充

- Video 协议第二步不再保留空的 `DeviceName` 状态。
- GB28181 模式统一使用 `gbDeviceId` 作为 Video 设备的本地 `DeviceName`。
- RTSP 代理模式统一复用第一步填写的“模拟设备名称”作为本地 `DeviceName`。
- 第三步“配置摘要”直接展示自动生成后的 `DeviceName`，用户不需要额外手工输入。
- `addDevice(...)` 同步补齐 Video 设备的 `deviceName`，确保创建、导入和复制场景使用同一套口径。
