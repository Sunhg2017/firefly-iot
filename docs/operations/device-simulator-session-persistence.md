# 设备模拟器连接持久化运维说明
> 模块: `firefly-simulator`
> 日期: 2026-03-14
> 状态: Done

## 1. 适用范围

用于设备模拟器关闭重开后的连接恢复验证、问题排查和发布检查。

## 2. 本次变更

- 模拟器配置存储从单纯渲染进程存储扩展为 Electron 用户目录文件持久化。
- 已连接且允许恢复的设备会在模拟器启动时自动尝试重连。
- Video 设备不参与自动恢复，避免重复在服务端创建资源。

## 3. 数据位置

模拟器持久化文件位置：

- Windows: `%APPDATA%` 或 Electron `userData` 目录下的 `simulator-store.json`

主进程通过以下 IPC 访问：

- `simulator-store:get`
- `simulator-store:set`
- `simulator-store:remove`

## 4. 验证步骤

```bash
cd firefly-simulator
npm run build:vite
```

验证流程：

1. 启动模拟器并创建至少一台 MQTT 或 HTTP 设备。
2. 手工连接设备，确认状态进入 `online`。
3. 完全关闭模拟器窗口。
4. 重新启动模拟器。
5. 确认该设备自动进入恢复流程，并最终回到 `online`。

额外检查：

- 手工点“断开”后的设备，重启后不应自动恢复。
- Video 设备即使此前在线，重启后也不应自动创建新资源。

## 5. 故障排查

### 5.1 设备列表未恢复

- 检查 `simulator-store.json` 是否存在。
- 检查主进程是否能正常读写 Electron `userData` 目录。
- 若文件为空，确认渲染进程是否成功调用 `simulatorStoreSetItem(...)`。

### 5.2 设备配置恢复了，但没有自动重连

- 检查该设备的 `restoreOnLaunch` 是否为 `true`。
- 检查设备协议是否属于自动恢复名单。
- 检查启动日志中是否出现 `Restoring ... persisted device connection(s)`。

### 5.3 自动恢复失败

- 优先检查目标服务端是否可达，例如 MQTT Broker、HTTP Connector、WebSocket 地址等。
- 若启动恢复失败，设备会进入 `error` 状态，便于继续手工排查。

## 6. 回滚

如需回滚，可恢复以下文件到变更前版本并重新构建模拟器：

- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/App.tsx`
- `firefly-simulator/src/utils/runtime.ts`
