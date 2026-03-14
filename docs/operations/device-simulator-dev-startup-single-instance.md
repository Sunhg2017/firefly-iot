# 设备模拟器开发启动单实例运维说明
> 版本: v1.0.0
> 日期: 2026-03-14
> 状态: Done

## 1. 适用范围

用于设备模拟器本地开发、问题排查和开发环境回归验证。

## 2. 正确启动方式

```bash
cd firefly-simulator
npm run electron:dev
```

当前脚本只启动 `vite`，Electron 由 `vite-plugin-electron` 自动拉起。

## 3. 依赖说明

- Node.js 与 npm 可用
- `firefly-simulator/node_modules` 已安装完成
- 本地未残留旧的 Electron 调试进程

## 4. 预期行为

- 终端启动 Vite 开发服务器
- Vite 插件编译 Electron main/preload
- 自动拉起一个 Electron 主窗口
- 开发态主窗口会自动打开 DevTools

## 5. 常见问题排查

## 5.1 仍然出现两个窗口

按以下顺序排查：

1. 是否手工又执行了一次 `electron .`
2. 是否存在残留的旧 Electron 开发进程
3. 是否有 IDE 任务、脚本缓存或历史命令仍在使用旧版 `electron:dev`

## 5.2 第二次启动后为什么没有新窗口

这是预期行为。主进程已启用单实例锁，重复启动时只会聚焦已有窗口。

## 5.3 如何验证修复生效

1. 执行 `npm run electron:dev`
2. 确认桌面上只出现一个模拟器主窗口
3. 再次手工执行一次 `electron .`
4. 确认没有新窗口出现，而是已有窗口被激活

## 6. 回归检查

- `npm run build:vite` 构建成功
- `npm run electron:dev` 仅出现一个主窗口
- 主窗口仍可正常打开 DevTools
- 热更新后窗口不会额外增加

## 7. 回滚说明

如需回滚，应同时回滚：

- `firefly-simulator/package.json`
- `firefly-simulator/electron/main.ts`

只回滚其中一处会导致启动说明与实际行为不一致。
