# 安全审计页面图标与登录日志字段对齐设计

## 1. 背景

系统运维空间的 `安全审计` 菜单在菜单台账中已经配置了 `SecurityScanOutlined`，但前端图标映射表未注册该图标，导致左侧菜单组只有文字没有图标。

同时，安全管理页的登录日志列表沿用了错误的前端字段口径：

- 后端返回字段为 `loginMethod`、`loginIp`、`result`
- 前端却按 `loginType`、`ip`、`success` 读取

这会直接造成以下问题：

- 登录成功记录在页面上全部显示为“失败”
- 登录 IP、User-Agent 等列显示为空
- 登录日志搜索条件传的是 `keyword`，而后端原实现只按 `username` 过滤，页面提示与接口能力不一致

## 2. 目标

- 让 `安全审计` 菜单恢复正确图标展示
- 让登录日志列表按真实登录结果显示成功/失败
- 让登录日志页面与后端接口字段保持一致
- 保持现有菜单、权限和所属空间不变，不引入新的菜单双轨逻辑

## 3. 方案

### 3.1 菜单图标

- 保持 `workspace_menu_catalog` 中 `platform-security-audit` 使用的 `SecurityScanOutlined` 不变
- 在 `firefly-web/src/config/iconMap.tsx` 中补充 `SecurityScanOutlined` 映射

这样不需要改动菜单台账数据，也不需要新增 Flyway SQL。

### 3.2 登录日志字段对齐

后端：

- `LoginLogVO` 增加 `userAgent`
- `AuthService.queryLoginLogs` 返回 `loginMethod`、`loginIp`、`userAgent`、`result`
- `LoginLogQueryDTO` 增加 `keyword`，按用户名或登录 IP 模糊查询
- `AuthController` 登录入口优先采集 `User-Agent`，读不到时回退到 `Sec-CH-UA` 等浏览器 Client Hints，并优先使用转发头解析真实 IP

前端：

- `SecurityPage` 登录日志表改为读取 `loginMethod`、`loginIp`、`result`、`userAgent`
- 用 `result === 'SUCCESS'` 渲染成功状态，其余按失败展示
- 查询表单把“登录结果”筛选提交为 `result`
- 搜索框与后端统一为“用户名或登录 IP”

## 4. 关键取舍

- 没有把后端继续兼容出 `success:boolean` 之类旧字段，而是直接收口到当前真实字段模型
- 没有改菜单台账，因为菜单配置本身是正确的，根因仅在前端图标映射缺失

## 5. 风险

- 前端与后端需要同时部署，才能同时获得正确的搜索条件和完整日志字段展示
- 历史数据库中的登录日志结果值仍以 `SUCCESS/FAILED` 为准，页面只做展示对齐，不做旧数据迁移
- 历史登录日志如果当时未写入 `user_agent`，本次只修复新登录记录采集，不会自动回填旧数据
