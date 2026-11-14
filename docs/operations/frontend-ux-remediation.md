# 前端交互友好性整改运维说明

> 模块: `firefly-web`
> 日期: 2026-11-15
> 关联设计: [前端交互友好性整改设计说明](../design/frontend-ux-remediation.md)

## 1. 部署方式

本次改动只涉及前端静态资源，无数据库变更、无新增环境变量、无后端接口变更。

### 1.1 本地构建

```bash
cd firefly-web
npm install
npx tsc --noEmit      # 类型检查
npx eslint src        # 静态检查（0 error）
npm run build         # 产出 dist/
```

### 1.2 容器/部署脚本

沿用现有流程：

```bash
./deploy/deploy.sh build
./deploy/deploy.sh up
```

前端镜像由多阶段构建生成，`deploy.sh build` 会根据源码指纹决定是否重建。发布后必须刷新浏览器（`Ctrl/Cmd + Shift + R`）以加载新的 hash 资源。

### 1.3 回滚

- 前端为纯静态资源，回滚方式为将 `firefly-web` 镜像/静态目录回退到上一个版本并重新发布。
- 不涉及数据迁移，回滚无需清理数据库。
- 回滚后 `sessionStorage` 中的 `firefly:open-tabs`、`firefly:session-expired` 与新版本不兼容时会被忽略或清理，不会阻断登录。

## 2. 运行期行为变化

| 行为 | 说明 |
| --- | --- |
| 401 刷新 | 并发 401 只发起一次 `/auth/refresh`；失败后前端清理本地会话并跳转登录页，携带 `redirect` 参数回跳 |
| 会话过期提示 | 跳转登录页时显示“登录状态已过期”，不再无提示踢出 |
| 账号信息加载失败 | 非 401 的 `/users/me` 失败保留缓存会话，页面顶部出现“账号信息未完整加载”横幅，可重试 |
| 菜单加载失败 | 侧栏显示“菜单加载失败 + 重试”，不再空白 |
| 页签 | 保存在 `sessionStorage`（键 `firefly:open-tabs`），刷新浏览器后恢复；关闭有未保存修改的页签会二次确认 |
| 保活上限 | 最多保留 12 个页面实例，超出后回收最早的非当前页 |
| 轮询 | TCP/UDP、WebSocket、LoRaWAN、Modbus、SNMP、监控、任务中心、告警记录等支持暂停，浏览器标签隐藏时暂停请求 |
| 本地持久化键 | `firefly:sider-collapsed`、`firefly:menu-open-keys`、`firefly:open-tabs`、`firefly:session-expired` |

## 3. 依赖服务

- 网关与各微服务接口路径未变化。
- 新增的远程搜索依赖既有接口：`/users/list`、`/products/list`、`/devices/list`、`/platform/tenants/list`。
- 任务中心角标轮询依赖 `/async-tasks/mine/list`；站内信角标依赖站内信计数接口。
- 协议解析调试的会话候选依赖 `/tcp-udp/tcp/sessions`、`/websocket/sessions`，无权限时自动降级为手工输入。

## 4. 监控与日志定位

前端没有独立监控服务，排障以浏览器 DevTools 为主：

1. **Network**：关注 `/auth/refresh` 是否 401、`/users/me` 与 `/users/me/permissions` 是否 5xx、`/workspace-menu-customizations/current/tree` 是否失败。
2. **Console**：`[firefly-web] 页面渲染异常` 为错误边界捕获的渲染错误，会同时展示在页面上可复制。
3. **Application → Session/Local Storage**：
   - `firefly:session-expired=1` 表示刚刚发生过会话过期。
   - `firefly:open-tabs` 异常时可直接删除该键重置页签。
   - `user_info` 为缓存的账号信息，清空后会重新拉取。

常见现象与处理：

| 现象 | 可能原因 | 处理 |
| --- | --- | --- |
| 登录后立即被踢回登录页 | refresh token 失效/被轮换、系统时间偏差 | 清理 `access_token`/`refresh_token` 后重新登录；检查网关 `/SYSTEM/api/v1/auth/refresh` |
| 侧栏空白 | 菜单树接口失败 | 点击侧栏“重试”；检查 `workspace-menu-customizations/current/tree` 与网关 |
| 页面全部 403 | 权限接口失败或角色被改动 | 顶部横幅重试；确认 `/users/me/permissions` 返回；必要时重新登录 |
| 任务中心角标不更新 | 浏览器标签处于后台（轮询暂停）或接口失败 | 切回标签页；打开任务中心查看错误提示 |
| 页签无法关闭 | 页面有未保存修改，等待确认框 | 确认放弃修改或先保存 |
| 实时页面数据不刷新 | 自动刷新被手动暂停 | 打开页面顶部“自动刷新”开关 |

## 5. 验证清单（发布前）

```bash
cd firefly-web
npx tsc --noEmit
npx eslint src
npm run build
```

手工回归建议：

1. 登录 → 退出 → 再登录，确认会话与回跳正常。
2. 打开 5 个以上页签，刷新浏览器：页签恢复、内容可加载。
3. 在有未保存表单的页面关闭页签：出现确认框。
4. 设备分组页选中分组：Network 中成员接口只请求一次。
5. 角色/用户/系统菜单多步表单：填第一步 → 下一步 → 保存，字段完整。
6. 告警记录：关闭告警出现确认；批量确认/关闭可用。
7. 任务中心：发起导出后关闭面板，角标仍更新。
8. 协议解析：编辑后点取消，出现“放弃未保存修改”确认。

## 6. 已知限制

- 前端无 E2E 测试，以上清单需人工执行。
- `npm run lint` 会输出 29 条既有的 `react-hooks/exhaustive-deps` 警告（0 error），不影响构建。
- 设备三元组导出按分组筛选时要求先勾选设备：后端 `DeviceTripleExportDTO` 尚未支持 `groupId/excludeVideo`，该限制在前端兜底。
- 数据查询后端只支持 `limit`，页面展示“最近 N 条”，不是全量分页。
- 审计日志用户名依赖后端 `AuditLogAspect` 写入的 `X-User-Name`；缺失时详情显示“未记录用户名”。
