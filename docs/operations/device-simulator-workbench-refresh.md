# 设备模拟器工作台改版运维说明

> 更新时间：2026-03-22
> 状态：Done

## 1. 适用范围

本文档用于说明设备模拟器工作台界面改版后的构建验证、发布注意事项和常见排查方式。

## 2. 本次变更内容

- 模拟器主界面调整为顶部总览、左侧设备列表、中间主工作区、右侧日志与工具区。
- 原底部状态条下线，统计信息收口到顶部总览。
- 设备列表、控制面板、日志面板统一为浅色卡片工作台风格。
- 压测、场景编排、数据模板管理入口从侧栏底部迁移到右侧快捷工具区。

本次变更仅涉及前端渲染层，不涉及数据库、菜单、权限或后端接口发布。

## 3. 构建验证

执行：

```bash
cd firefly-simulator
npm run build:vite
```

通过标准：

- `tsc` 编译通过
- renderer 构建成功
- electron main / preload 构建成功
- 没有新的类型错误或 JSX 结构错误

## 4. 发布注意事项

- 本次为纯前端资源更新，发布时需确保桌面端加载的是最新打包产物，而不是旧缓存资源。
- 如果本地仍看到旧的深色底栏或旧的侧栏底部图标按钮，优先确认是否仍在运行旧版 renderer 资源。
- 原 `StatusBar` 组件已删除；若后续有自定义分支仍引用该组件，合并时需要同步处理冲突。

## 5. 回归检查

重点验证以下路径：

1. 启动模拟器后，首页应先看到顶部总览卡片，而不是底部状态条。
2. 左侧设备列表应显示浅色卡片样式，支持搜索、协议筛选、状态筛选、导入导出和批量操作。
3. 右侧应存在独立的日志卡片和快捷工具卡片。
4. 选中设备后，中间控制区顶部应显示设备摘要头图和运行指标。
5. `HTTP / MQTT / CoAP` 的数据上报能力、物模型加载能力和协议专属调试能力仍然可用。
6. 压测、场景编排、数据模板三个入口应可直接点击打开，不再是仅图标形式。

## 6. 常见问题排查

### 6.1 页面还是旧布局

按下面顺序排查：

1. 确认是否重新执行过 `npm run build:vite`
2. 确认 Electron 进程是否完全退出后重新启动
3. 确认当前加载的是最新 `dist` / `dist-electron` 产物

### 6.2 右侧日志区为空

- 先确认当前是否确实产生过系统日志或设备日志。
- 如启用了“当前”过滤，只会显示当前设备和系统日志。
- 如果导出按钮不可用，说明当前过滤结果为空，不是日志组件异常。

### 6.3 快捷工具入口找不到

- 新版入口位于右侧“快捷工具”卡片中，不再放在设备列表底部。
- 如果右侧区域未出现，优先确认是否加载了旧版前端资源。

## 7. 回滚说明

如需回滚本次界面改版，需要同时回滚以下文件：

- `firefly-simulator/src/App.tsx`
- `firefly-simulator/src/components/DeviceControlPanel.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/src/components/LogPanel.tsx`
- `firefly-simulator/src/components/StressTestPanel.tsx`
- `firefly-simulator/src/components/ScenarioPanel.tsx`
- `firefly-simulator/src/components/TemplateEditorPanel.tsx`
- `firefly-simulator/src/components/index.ts`
- `docs/design/device-simulator-workbench-refresh.md`
- `docs/operations/device-simulator-workbench-refresh.md`
- `docs/user-guide/device-simulator-workbench-refresh.md`

回滚后建议重新执行一次：

```bash
cd firefly-simulator
npm run build:vite
```

## 8. 2026-03-22 主题收口补充

- 模拟器基础控件主题已从 `darkAlgorithm` 切回浅色 `defaultAlgorithm`。
- 如果发布后仍看到黑色输入框、黑色按钮或深色告警块，优先确认是否加载了旧版 renderer 资源。
- 本次补充只改动 `firefly-simulator/src/main.tsx` 的主题配置，不涉及业务逻辑和接口链路。

## 9. 2026-03-22 界面提示语收口补充

- 页面中的非操作型说明文案已收口，改为以操作提示为主。
- 如果发布后仍看到“解释布局、解释改版思路”这一类长说明，优先确认是否加载了旧版 renderer 资源。
- 本次补充只涉及前端文案，不影响设备连接、数据上报、物模型同步和协议调试链路。

## 10. 2026-03-22 新建设备抽屉风格收口补充

- 新建设备抽屉已从深色渐变样式切回浅色卡片工作台风格，发布后如仍看到深色头部、深色摘要卡片或重色块提示，优先确认是否加载了旧版 renderer 资源。
- 本次补充只改动 `firefly-simulator/src/components/AddDeviceModal.tsx` 的前端样式和提示文案，不涉及设备创建逻辑、物模型拉取逻辑和协议接入链路。
- 验证时重点检查三点：抽屉头部与底部是否为浅色、步骤条是否嵌入浅色卡片、HTTP/MQTT/物模型区域是否只保留简短操作提示。

## 11. 2026-03-22 中等宽度窗口布局修复补充

- 当桌面窗口宽度落在中等区间时，工具区和日志区位于第二行；若第二行不限制高度，会把第一行主工作区压缩到不可见。
- 本次补充在 `firefly-simulator/src/App.tsx` 中为第二行辅助区增加固定高度上限，并保持主工作区优先使用剩余空间。
- 发布后若仍出现“打开模拟器只看到快捷工具和运行日志”的现象，优先确认是否加载了旧版 renderer 资源。
- 回归时重点检查：在非全屏、缩放 125% 或较窄窗口下，设备列表、控制面板、快捷工具和运行日志应同时可见。

## 12. 2026-03-22 PC 单屏主框架补充

- 本次补充新增 `firefly-simulator/src/index.css`，统一设置 `html`、`body`、`#root` 为满高并关闭外层滚动，修复右侧整页滚动条问题。
- `firefly-simulator/src/App.tsx` 现已在 `lg` 及以上断点保持右侧栏常驻，以匹配 PC 单屏联调场景。
- 回归时重点检查：常见桌面分辨率、窗口最大化和 125% 缩放场景下，页面右侧不应再出现浏览器级下拉条；滚动只应发生在设备列表、日志或具体功能面板内部。

## 13. 2026-03-22 桌面应用风格补充

- 本次补充继续调整 `firefly-simulator/src/App.tsx`，把顶部大卡片改为桌面工具栏式头部，并收紧整体留白和面板阴影。
- 发布后如仍看到旧的“大 Banner + 首页卡片”风格，优先确认是否加载了旧版 renderer 资源。
- 回归时重点检查：标题栏高度是否收敛、统计卡是否压缩到工具栏区域、主工作区是否更接近桌面应用工作台而不是网页首页。

## 14. 2026-03-22 顶部信息去重补充

- 本次继续调整 `firefly-simulator/src/App.tsx` 顶部区域，移除顶部的设备统计卡和快捷键提示，避免与左侧设备列表头部的统计和操作重复。
- 发布后如果仍看到顶部统计卡或快捷键标签，优先确认是否仍在加载旧版 renderer 资源。
- 回归时重点检查：顶部只保留应用标识；设备总量、在线数、异常数以及批量操作统一由左侧设备列表区域承担。
