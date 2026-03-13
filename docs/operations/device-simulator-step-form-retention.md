# 设备模拟器分步创建设备保值修复运维说明
> 模块: firefly-simulator
> 日期: 2026-03-14
> 状态: Done

## 1. 适用场景

用于排查“新建设备后访问参数丢失”“日志里设备名为 undefined”“刚创建的 HTTP/MQTT/CoAP 设备无法认证”这类问题。

## 2. 发布说明

- 前端变更文件为 `firefly-simulator/src/components/AddDeviceModal.tsx`。
- 发布后需要重新构建模拟器前端资源，避免仍加载旧版抽屉提交逻辑。

## 3. 验证步骤

执行：

```bash
cd firefly-simulator
npm run build:vite
```

回归检查：

1. 新建一个 HTTP 设备，填写 `ProductKey`、`DeviceName`、`DeviceSecret`。
2. 完成第三步后点击“创建设备”。
3. 检查设备访问概览，确认三元组字段完整保留。
4. 检查系统日志，确认新增日志中的设备名称不为空。
5. 直接执行连接，确认不再因为空认证参数失败。

## 4. 常见故障排查

### 4.1 创建后接入参数仍为空

- 确认浏览器或 Electron renderer 不是旧缓存。
- 确认页面底部按钮已走 `handleCreateDevice`，而不是历史的局部 `validateFields()` 流程。
- 确认新增协议字段时已同步补充 `getStepFields(...)` 映射。

### 4.2 日志仍出现 undefined

- 先检查基础信息步骤中的模拟器名称是否填写。
- 再检查是否误改了 `nickname` 的兜底逻辑，当前规则是 `nickname` 为空时回落到 `name`。

## 5. 回滚说明

如需回滚，只需回退 `firefly-simulator/src/components/AddDeviceModal.tsx` 与本说明对应文档，并重新执行一次前端构建。
