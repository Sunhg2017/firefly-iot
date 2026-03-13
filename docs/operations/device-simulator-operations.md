# 设备模拟器运维说明

> 版本: v1.0.0
> 日期: 2026-03-13
> 状态: Done

## 1. 适用范围

本文档用于设备模拟器模块的构建验证、发布检查、常见问题排查和回滚说明。

## 2. 本次优化内容

- 新建模拟设备由弹窗改为抽屉式分步配置。
- 复杂协议配置拆分为“基本信息 / 接入参数 / 扩展配置”三步。
- 设备列表入口文案统一为中文。
- WebSocket 内部识别参数移入高级步骤。

## 3. 构建验证

执行：

```bash
cd firefly-simulator
npm run build:vite
```

通过标准：

- renderer 构建成功
- electron main/preload 构建成功
- 没有 TypeScript 类型错误

## 4. 回归检查

### 4.1 新建设备流程

重点检查：

- 点击“新建”后打开抽屉，而不是弹窗
- 步骤显示为三步
- 基本信息填写完成后才能进入下一步
- 已完成步骤支持回退修改
- 最终点击“创建设备”后能成功加入设备列表

### 4.2 协议分支

重点检查：

- HTTP / CoAP：显示三元组鉴权字段
- MQTT：按认证方式切换 `deviceSecret` / `productSecret`
- Video：
  - RTSP 模式只要求 RTSP 源地址
  - GB28181 模式显示 SIP 和通道配置
- WebSocket：内部识别参数只出现在扩展配置步骤

### 4.3 列表与入口

重点检查：

- 顶部标题、导入导出按钮、批量连接按钮显示中文
- 筛选与空态文案显示中文
- 复制、删除、导入导出成功/失败提示显示中文

## 5. 常见问题排查

### 5.0 开发态出现 Electron CSP 警告

当前模拟器入口页已经补充显式 Content-Security-Policy。

如果本地仍看到旧的 `Insecure Content-Security-Policy` 告警，优先排查：

1. 开发进程是否仍在使用旧页面缓存
2. Electron 窗口是否在本次修改前就已经打开，未完全重启
3. 是否加载了非本仓库生成的旧 `index.html`

### 5.1 新建抽屉无法下一步

先确认当前步骤的必填项是否已填写，再看控制台是否有校验错误信息。

### 5.2 出现 `useForm is not connected to any Form element`

该问题通常表示表单实例已经创建，但实际表单节点尚未挂载或已销毁。

本次实现已经通过表单快照状态规避此问题；如果再次出现，优先检查是否在抽屉关闭后继续使用 `useWatch`、`getFieldsValue` 或其他直接依赖 `form` 挂载状态的调用。

### 5.3 MQTT 一型一密创建后连接失败

排查顺序：

1. 确认动态注册地址是否正确
2. 确认 `productKey` 和 `productSecret` 是否匹配
3. 确认注册接口 `/api/v1/protocol/device/register` 可用
4. 确认 Broker 地址是否可达

### 5.4 WebSocket 连接不上

排查顺序：

1. 确认 `wsEndpoint` 是否正确
2. 确认是否需要 `deviceId / productId / tenantId`
3. 确认 connector 已暴露 `/ws/device`

### 5.5 GB28181 配置过长

这是本次拆步后的预期行为。先完成基础视频模式配置，再在高级步骤维护 SIP 和通道参数。

## 6. 回滚说明

如需回滚本次优化，需同时回滚：

- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/README.md`
- `docs/design/detailed-design-device-simulator.md`
- `docs/operations/device-simulator-operations.md`
- `docs/user-guide/device-simulator-guide.md`

回滚后建议重新执行 `npm run build:vite`。
