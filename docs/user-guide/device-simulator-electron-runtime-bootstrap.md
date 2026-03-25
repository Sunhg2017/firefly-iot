# 设备模拟器启动前 Electron 自检使用说明
> 模块: firefly-simulator
> 日期: 2026-03-25
> 状态: Done

## 1. 适用角色

- 本地开发设备模拟器的研发人员
- 负责桌面端构建与回归验证的测试人员

## 2. 你会看到什么变化

从现在开始，执行以下命令时，模拟器会先检查 Electron 本地运行时是否完整：

- `npm run electron:dev`
- `npm run electron:build`

如果 Electron 已完整安装，命令会直接继续执行。

如果 Electron 运行时缺失，命令会先自动补装，再继续启动或打包。

## 3. 标准使用方式

```bash
cd firefly-simulator
npm run electron:dev
```

常见终端提示：

- `Electron <version> runtime ready.`：说明本地 Electron 已可直接使用
- `Electron runtime missing or incomplete, reinstalling local binary...`：说明系统正在自动补装缺失的运行时

## 4. 补装失败时怎么处理

按以下顺序执行：

1. 保持在 `firefly-simulator` 目录
2. 执行 `npm run ensure:electron`
3. 如果仍失败，执行 `npm install`
4. 再次执行 `npm run electron:dev`

## 5. 注意事项

- 首次补装 Electron 需要下载桌面运行时，耗时会比平时启动更长
- 如果公司网络限制外网下载，需要先配置代理或镜像
- `npm run dev` 只启动前端预览，不会主动补装 Electron
