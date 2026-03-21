# 前端操作提示文案收口运维说明

> 更新时间：2026-03-22
> 状态：Done

## 1. 适用范围

本文档用于说明本次前端操作提示文案收口的发布、验证和回归检查方式，覆盖 `firefly-web`，并补充说明设备模拟器的复查结论。

## 2. 变更内容

- `firefly-web` 多个页面的 `Alert`、`PageHeader` 描述和抽屉提示语已改为操作型文案。
- 页面不再展示“重构思路”“改版原因”“旧实现替换方式”这一类说明。
- `firefly-simulator` 已复查，当前工作台、设备列表、设备控制面板和新建设备抽屉无需继续删除设计说明文案。

## 3. 构建验证

执行：

```bash
cd firefly-web
npm run build

cd ../firefly-simulator
npm run build:vite
```

通过标准：

- `firefly-web` 的 TypeScript 编译通过，Vite 构建成功。
- `firefly-simulator` 的 renderer / electron main / preload 构建成功。
- 无新增 JSX 结构错误和类型错误。

## 4. 回归检查

发布后重点检查以下页面：

1. 数据分析导出页
   确认导出提示只保留“提交后到任务中心下载结果”。
2. 租户 OpenAPI 文档页
   确认顶部说明只保留订阅范围、网关地址、签名方式和快照时间。
3. 设备消息页
   确认设备选择区、服务调用区不再解释生命周期服务为何被过滤，只提示如何发送。
4. 角色与用户页面
   确认授权和角色分配提示改为“怎么选权限/角色”。
5. OpenAPI 管理、设备标签、协议解析、系统设置、租户授权页
   确认页面提示以操作结果和前置条件为主。

## 5. 发布注意事项

- 本次变更只涉及前端文案，不涉及菜单、权限、数据库和后端接口发布。
- 若发布后仍看到旧的说明口吻，优先确认是否加载了旧版前端静态资源。
- 由于模拟器本轮只做复查未改代码，如模拟器界面仍出现问题，应先核对是否仍停留在旧版本安装包或缓存资源。

## 6. 回滚说明

如需回滚本次变更，至少回滚以下文件：

- `firefly-web/src/pages/analysis/DataAnalysisPage.tsx`
- `firefly-web/src/pages/api-key/OpenApiDocsTab.tsx`
- `firefly-web/src/pages/device-message/DeviceMessagePage.tsx`
- `firefly-web/src/pages/device-tag/DeviceTagPage.tsx`
- `firefly-web/src/pages/open-api/OpenApiPage.tsx`
- `firefly-web/src/pages/protocol-parser/ProtocolParserPage.tsx`
- `firefly-web/src/pages/role/RoleList.tsx`
- `firefly-web/src/pages/settings/SystemSettingsPage.tsx`
- `firefly-web/src/pages/tenant/TenantList.tsx`
- `firefly-web/src/pages/user/UserList.tsx`
- `docs/design/frontend-operational-copy-cleanup.md`
- `docs/operations/frontend-operational-copy-cleanup.md`
- `docs/user-guide/frontend-operational-copy-cleanup.md`
