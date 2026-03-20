# 设备模拟器下行验证与完整日志运维说明

> 版本: v1.0.0
> 日期: 2026-03-21
> 状态: Done

## 1. 适用范围

本文档用于设备模拟器“MQTT 下行验证与完整日志”优化的发布、验证、排障和回滚。

## 2. 变更内容

- MQTT 收到消息后，全局日志不再截断 payload。
- MQTT 模拟设备连接后会自动订阅三类平台下行主题：
  - 属性设置
  - 服务调用
  - 通用下行
- 自动恢复连接场景同步使用相同的默认订阅集合。

## 3. 发布要求

- 本次变更仅涉及 `firefly-simulator` 前端与 Electron 渲染层。
- 不涉及数据库、Flyway、菜单权限、后端服务发布顺序调整。
- 发布时确保交付了最新的 `firefly-simulator` 构建产物。

## 4. 构建与验证

执行：

```bash
cd firefly-simulator
npm run build:vite
```

通过标准：

- TypeScript 编译成功
- renderer 构建成功
- electron main / preload 构建成功

## 5. 回归检查

### 5.1 MQTT 下行联调

1. 新建或选择一台 MQTT 模拟设备并连接。
2. 打开设备消息工作台，分别下发：
   - 属性设置
   - 服务调用
   - 通用下行
3. 确认模拟器可以连续收到三类消息，不再只收到服务调用。

### 5.2 长日志显示

1. 下发一个包含长 JSON 的 MQTT 消息。
2. 确认模拟器底部日志区可以完整显示，不再只保留前 200 个字符。
3. 确认换行后仍可滚动、导出。

### 5.3 自动恢复连接

1. 让 MQTT 设备处于在线并关闭模拟器。
2. 重新打开模拟器，等待自动恢复连接。
3. 再次下发三类消息，确认恢复后的设备仍能接收。

## 6. 常见排查

### 6.1 仍然只能收到服务调用

- 优先确认当前运行的是最新模拟器构建产物，而不是旧缓存资源。
- 检查设备是否确实处于 MQTT 在线状态。
- 检查平台下发 topic 是否仍属于：
  - `thing/property/set`
  - `thing/service/invoke`
  - `thing/downstream`

### 6.2 日志里仍然只有半截 payload

- 确认当前资源已包含最新 `App.tsx` 和 `LogPanel.tsx` 打包结果。
- 检查是否在查看旧版本安装包，而不是当前工作区构建产物。
- 若 MQTT 面板弹窗正常而底部日志异常，优先排查桌面端资源是否混用了旧 `dist` 文件。

### 6.3 自动恢复后收不到下行

- 确认设备的 `restoreOnLaunch` 状态正常。
- 确认最新版本已经包含 `runtime.ts` 的默认订阅更新。
- 检查 Broker 是否允许恢复连接后的重新订阅。

## 7. 回滚说明

如需回滚本次优化，只需回滚设备模拟器相关前端资源：

- `firefly-simulator/src/App.tsx`
- `firefly-simulator/src/components/LogPanel.tsx`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/utils/mqtt.ts`
- `firefly-simulator/src/utils/runtime.ts`

回滚后重新执行：

```bash
cd firefly-simulator
npm run build:vite
```

## 8. 已知边界

- 本次优化解决的是“接收并验证下行内容”，不自动生成下行应答。
- 如需验证平台对 `thing/property/set/reply` 或 `thing/service/reply` 的处理，仍需设备侧手工或后续扩展实现应答报文。
