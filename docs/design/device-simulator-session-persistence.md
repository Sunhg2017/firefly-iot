# 设备模拟器连接持久化设计说明
> 模块: `firefly-simulator`
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备模拟器此前只把设备配置保存在渲染进程本地存储里，并且在持久化时主动把运行状态重置为 `offline`。这会带来两个问题：

- 模拟器窗口关闭后，设备配置和连接状态依赖渲染进程存储，稳定性不足。
- 重新打开模拟器后，之前已连接的设备不会自动恢复，用户需要逐台重新连接。

## 2. 目标

- 将模拟器关键状态持久化到 Electron 用户目录文件，而不是只依赖渲染进程 `localStorage`。
- 记录哪些设备在关闭前处于“应恢复连接”状态。
- 模拟器启动后自动恢复可安全重连的设备连接。

## 3. 方案

### 3.1 持久化介质

- 在 Electron 主进程增加 `simulator-store` IPC。
- 数据落盘到 `app.getPath('userData')/simulator-store.json`。
- Zustand 持久化层改为优先读写 Electron 文件存储，并保留 `localStorage` 作为兼容回退读取源。

### 3.2 连接恢复标记

- 为 `SimDevice` 新增 `restoreOnLaunch` 字段。
- 用户主动连接成功后：
  - 对可安全恢复的协议写入 `restoreOnLaunch = true`
- 用户主动断开、批量断开或连接失败后：
  - 写入 `restoreOnLaunch = false`

### 3.3 启动恢复策略

启动时自动恢复以下协议：

- HTTP
- CoAP
- MQTT
- SNMP
- Modbus
- WebSocket
- TCP
- UDP
- LoRaWAN

不自动恢复以下协议：

- Video

原因：视频设备连接过程会在服务端创建资源，直接自动重放可能导致重复创建设备。

### 3.4 运行时行为

- 持久化时不再一律把所有设备当作普通离线设备处理。
- 若设备标记为 `restoreOnLaunch = true`，下次启动时先以 `connecting` 状态进入界面，再执行恢复。
- 恢复过程增加幂等保护，避免 React 开发态 `StrictMode` 导致重复恢复。

## 4. 影响范围

- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/vite-env.d.ts`
- `firefly-simulator/src/store.ts`
- `firefly-simulator/src/App.tsx`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/src/utils/runtime.ts`

## 5. 设计取舍

- 没有为 Video 自动恢复连接，因为其连接语义不是单纯重建本地会话，而可能在服务端产生重复资源。
- 没有持久化自动上报定时器、临时 token、运行计数等瞬时状态，这些属于运行期数据，启动后应重新建立。
