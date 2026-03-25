# 设备模拟器 Electron 运行时自检补齐运维说明
> 模块: firefly-simulator
> 日期: 2026-03-25
> 状态: Done

## 1. 适用范围

用于设备模拟器本地开发启动失败、Electron 二进制缺失、桌面打包前环境核验等场景。

## 2. 变更内容

设备模拟器现在会在以下命令执行前自动检查 Electron 本地运行时：

- `npm run electron:dev`
- `npm run build`
- `npm run electron:build`

检查不通过时，会自动执行 `npm run ensure:electron` 补齐本地 Electron 二进制。

## 3. 运维前置条件

- 本地已安装 Node.js 与 npm
- `firefly-simulator/node_modules` 已存在
- 开发机网络可访问 Electron 下载源，或已配置企业镜像

## 4. 标准处理步骤

```bash
cd firefly-simulator
npm run electron:dev
```

若本地 Electron 运行时完整，终端会输出：

```text
[ensure-electron] Electron <version> runtime ready.
```

若运行时缺失，终端会先输出：

```text
[ensure-electron] Electron runtime missing or incomplete, reinstalling local binary...
```

补装成功后会继续进入正常启动流程。

## 5. 常见故障排查

## 5.1 报错 `Electron failed to install correctly`

说明 `node_modules/electron` 只有 npm 包元数据，没有真实 Electron 可执行文件。

处理顺序：

1. 执行 `cd firefly-simulator`
2. 执行 `npm run ensure:electron`
3. 若仍失败，再执行 `npm install`
4. 重新执行 `npm run electron:dev`

## 5.2 自检脚本补装失败

优先检查：

1. 是否能访问 Electron 下载源或企业镜像
2. 是否存在代理、证书或公司网络拦截
3. `npm config get proxy` 与相关镜像配置是否正确

## 5.3 如何判断补装是否完成

检查以下文件是否存在：

- `firefly-simulator/node_modules/electron/path.txt`
- `firefly-simulator/node_modules/electron/dist/version`
- `path.txt` 指向的实际 Electron 可执行文件

## 6. 回滚说明

如需回滚本次变更，应同时回滚：

- `firefly-simulator/package.json`
- `firefly-simulator/scripts/ensure-electron.mjs`
- `firefly-simulator/README.md`
- `docs/design/device-simulator-electron-runtime-bootstrap.md`
- `docs/operations/device-simulator-electron-runtime-bootstrap.md`
- `docs/user-guide/device-simulator-electron-runtime-bootstrap.md`

只回滚脚本而不回滚文档，会导致启动说明与实际行为不一致。
