# 设备模拟器开发启动单实例设计说明
> 版本: v1.0.0
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备模拟器在开发模式下执行 `npm run electron:dev` 时，会出现两个 Electron 窗口，其中一个窗口还会自动打开 DevTools，影响本地调试体验，也容易让人误判为页面逻辑重复创建了窗口。

## 2. 根因分析

- 模拟器使用 `vite-plugin-electron` 管理开发态主进程与预加载脚本构建。
- `vite-plugin-electron` 在 `vite serve` 场景下会自动拉起 Electron。
- 原来的 `firefly-simulator/package.json` 中，`electron:dev` 还额外执行了 `wait-on http://localhost:5173 && electron .`。
- 最终结果是开发态存在两条 Electron 启动链路：
  - Vite 插件自动启动一条
  - npm 脚本手动启动一条
- 两个 Electron 进程都会执行主进程入口并创建主窗口，因此用户会看到两个窗口。

## 3. 设计目标

- 开发态只保留一条 Electron 启动入口。
- 即使误启动第二个 Electron 进程，也不能继续创建第二个主窗口。
- 不影响 Vite 开发服务器、主进程热重启和预加载脚本热刷新能力。

## 4. 方案

## 4.1 启动入口收口

- 将 `electron:dev` 从并发执行 `vite` 和 `electron .` 改为仅执行 `vite`。
- Electron 主进程完全交给 `vite-plugin-electron` 在开发态拉起。

## 4.2 主进程单实例保护

- 在 `electron/main.ts` 中增加 `app.requestSingleInstanceLock()`。
- 当无法拿到锁时直接退出当前进程。
- 监听 `second-instance` 事件，在已有主窗口时只恢复并聚焦，不再新建窗口。

## 4.3 窗口创建幂等化

- `createWindow()` 在创建前检查 `mainWindow` 是否已经存在且未销毁。
- 若已存在，则执行恢复、聚焦并直接返回已有窗口实例。

## 5. 设计取舍

- 没有继续保留脚本中的 `wait-on + electron .`，因为这会与插件内置启动机制重复。
- 没有把问题仅交给单实例锁兜底，因为真正的不合理点是启动链路重复；单实例保护只是第二道保险。

## 6. 影响范围

- `firefly-simulator/package.json`
- `firefly-simulator/electron/main.ts`

## 7. 风险与回滚

- 如果重新把 `electron:dev` 恢复成手动执行 `electron .` 的形式，开发态双窗口问题会再次出现。
- 若需要回滚，应同时回滚启动脚本和主进程单实例逻辑，避免文档与行为不一致。
