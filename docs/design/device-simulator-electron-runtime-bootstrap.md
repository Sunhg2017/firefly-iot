# 设备模拟器 Electron 运行时自检补齐设计说明
> 模块: firefly-simulator
> 日期: 2026-03-25
> 状态: Done

## 1. 背景

设备模拟器当前通过 `npm run electron:dev` 启动 Vite，再由 `vite-plugin-electron` 拉起 Electron 主进程。

现场排查发现，部分开发机虽然已经装好了 `firefly-simulator/node_modules`，但 `node_modules/electron/path.txt` 与 `dist/` 实际运行时文件缺失，导致启动阶段直接报错：

- `Electron failed to install correctly, please delete node_modules/electron and try installing again`

该问题通常出现在以下场景：

- 首次安装依赖时 `electron` 的 `postinstall` 没有成功执行
- 安装阶段网络波动，Electron 二进制下载不完整
- 本地缓存或依赖目录被清理后，只剩下 JS 包元数据，没有真实 Electron 可执行文件

## 2. 目标

- 让 `electron:dev` 和 `electron:build` 在真正启动前先检查本地 Electron 运行时是否完整
- 发现缺失时自动执行补装，而不是把失败延后到 Electron 拉起阶段
- 补装失败时输出明确的运维指引，缩短排查路径

## 3. 范围

本次变更只覆盖 `firefly-simulator` 的本地启动与构建预检查，不改动业务协议模拟逻辑、工作台交互或设备数据结构。

涉及文件：

- `firefly-simulator/package.json`
- `firefly-simulator/scripts/ensure-electron.mjs`

## 4. 方案

## 4.1 启动前自检

新增 `npm run ensure:electron`：

- 读取 `electron/package.json`，拿到目标版本
- 校验 `node_modules/electron/path.txt`
- 校验 `node_modules/electron/dist/version`
- 校验 `path.txt` 指向的实际可执行文件是否存在

只要任一检查失败，就判定当前 Electron 运行时不完整。

## 4.2 自动补装

运行时不完整时，脚本直接执行 `node node_modules/electron/install.js`：

- 复用 Electron 官方安装脚本，不重新维护下载逻辑
- 让 `path.txt`、`dist/version` 与实际二进制都回到官方安装口径
- 安装完成后再次复检，避免“命令执行过但仍不可用”的假成功

## 4.3 启动入口收口

将以下入口统一接入自检：

- `preelectron:dev`
- `prebuild`
- `preelectron:build`

这样开发启动和桌面打包都走同一套运行时校验，不再依赖开发者记得手工重装 Electron。

## 5. 设计取舍

- 没有把下载逻辑直接写进项目脚本，而是复用 `electron/install.js`，避免和上游安装规则分叉
- 没有继续保留“启动失败后提示用户自己修复”的旧路径，而是改为启动前先收口检查
- `dev` 纯前端预览脚本仍保持只启动 Vite，因为它不要求 Electron 运行时

## 6. 风险与约束

- 自动补装仍依赖开发机可访问 Electron 下载源；网络不可达时会失败，但失败信息会更直接
- 首次补装会增加一次启动前等待时间，属于预期行为
- 若开发者手工设置了 Electron 私有镜像，应继续沿用本地 npm / 环境变量配置

## 7. 验证点

- 当 `node_modules/electron` 缺少运行时文件时，执行 `npm run electron:dev` 会先进入自检补装
- 当运行时已完整时，自检应快速通过，不重复下载
- `npm run electron:build` 在打包前也会执行相同检查
