# Web 控制台模拟器风格统一改造运维说明

## 1. 适用范围

本文档用于 `firefly-web` 控制台完成模拟器风格统一改造后的构建、验证与排障。

## 2. 发布内容

本次发布仅涉及 Web 前端样式与布局：

- 全局主题 token 收口为浅色实体卡片风格
- 基础布局改为浅色侧边栏和实体头部
- 共享 `PageHeader` 头部样式更新
- 登录页重做为简洁业务入口页
- 仪表盘首页重做为概览卡和实体指标卡布局

本次不涉及数据库、Flyway、菜单权限、接口和后端逻辑变更。

## 3. 依赖条件

- Node.js 与 npm 可用
- `firefly-web` 依赖安装完整
- Vite 构建链路正常

## 4. 验证步骤

执行构建：

```bash
cd firefly-web
npm run build
```

手工回归：

1. 打开登录页，确认整体为简洁双栏入口布局，左侧展示居中的圆形轨道式联网动效，右侧不再显示独立表单外框，不再有额外说明文字、底部提示卡和背景方框。
2. 登录页分别验证账号密码登录和手机号登录入口是否仍可正常提交。
3. 登录成功后进入主界面，确认侧边栏、头部、标签页、内容壳层都已切换为浅色实体卡片风格。
4. 确认右上角“接口文档 / 站内信 / 告警 / 异步任务”默认仅显示图标，鼠标悬停或展开时会轻微放大并显示文字，且不再带独立外框。
5. 确认右上角用户区不再显示外围边框，悬停后仅出现轻量高亮反馈。
6. 随机进入多个业务页面，确认页面头部均已更新为统一的卡片式 `PageHeader`。
7. 打开仪表盘首页，确认首屏为概览区、实体指标卡、最近告警和分布面板的新布局。
8. 在窄屏窗口打开登录页，确认会自动切换为单栏布局，不出现横向溢出。

## 5. 常见故障

### 5.1 登录页仍显示旧结构或信息过多

排查项：

- 是否已加载新版本前端资源
- `firefly-web/src/pages/login/index.tsx` 是否已更新
- `firefly-web/src/styles/global.css` 中登录页样式是否已更新
- 浏览器缓存是否仍命中旧静态资源

### 5.2 主界面仍显示深色侧边栏或毛玻璃头部

排查项：

- `firefly-web/src/layouts/BasicLayout.tsx` 是否已更新为浅色布局
- `firefly-web/src/styles/global.css` 是否仍残留旧版深色菜单或 `backdropFilter` 样式
- 是否存在部署侧静态资源缓存

### 5.3 仪表盘仍显示旧彩色大卡

排查项：

- `firefly-web/src/pages/dashboard/DashboardPage.tsx` 是否已更新
- 是否已重新构建并发布 `dist`

### 5.4 构建失败

排查项：

- 本地 `node_modules` 是否完整
- TypeScript 编译错误是否来自新增样式或 JSX 结构
- Vite 打包是否被旧缓存影响

## 6. 回滚说明

如需回滚，需同时回滚以下文件：

- `firefly-web/src/main.tsx`
- `firefly-web/src/styles/global.css`
- `firefly-web/src/layouts/BasicLayout.tsx`
- `firefly-web/src/components/PageHeader.tsx`
- `firefly-web/src/pages/login/index.tsx`
- `firefly-web/src/pages/dashboard/DashboardPage.tsx`

回滚后重新执行：

```bash
cd firefly-web
npm run build
```

## 7. 运维提醒

- 本次改造是前端统一视觉收口，属于全局样式变化，发布后多个页面会一起变更观感。
- 构建输出中仍可能出现大 chunk 警告，这是现有依赖体量导致的已知问题，不属于本次样式改造引入的功能故障。
