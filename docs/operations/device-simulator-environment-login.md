# 设备模拟器环境切换与租户登录运维说明

> 更新时间：2026-03-22
> 适用模块：`firefly-simulator`

## 1. 发布范围

本次发布包含模拟器前端和 Electron 主进程：

- 环境管理
- 当前环境登录/退出
- 环境登录“记住我”
- 新建设备按当前租户查询产品
- 按环境预填模拟器地址

## 2. 依赖服务

要完整使用本次能力，需要以下服务可访问：

- 平台网关：用于登录和产品查询
- `firefly-system`：提供登录/退出接口
- `firefly-device`：提供产品列表与 `ProductSecret` 查询接口

如果上述服务不可用，模拟器仍可继续手工录入 `ProductKey` 创建设备。

## 3. 构建与验证

执行：

```bash
cd firefly-simulator
npm run build:vite
```

通过标准：

- TypeScript 编译通过
- Renderer 构建通过
- Electron `main/preload` 构建通过

## 4. 发布检查

重点检查：

- 左侧设备列表顶部是否出现环境选择、环境管理和登录/退出入口
- 登录门禁页和工作台登录抽屉是否出现“记住我”复选框
- 切换环境后，新建设备抽屉是否自动带出该环境的地址默认值
- 登录后，新建设备的 HTTP / MQTT / CoAP 是否能查询当前租户产品
- 一型一密产品被选中后，是否能自动加载 `ProductSecret`
- 退出当前环境后，产品选择是否回退为手工录入
- 勾选“记住我”后，关闭并重新打开模拟器，当前环境是否仍保持登录
- 不勾选“记住我”后，关闭并重新打开模拟器，当前环境是否回到未登录

## 5. 常见问题排查

### 5.1 登录失败

排查顺序：

1. 确认环境里的 `gatewayBaseUrl` 是否指向正确网关。
2. 确认网关已发布 `SYSTEM` 路由。
3. 确认用户名和密码是否正确。
4. 查看网关或 `firefly-system` 日志，确认 `/auth/login` 是否返回业务错误码。

### 5.2 勾选“记住我”后重开仍未登录

排查顺序：

1. 确认登录时确实勾选了“记住我”。
2. 确认本地 `firefly-sim-workspace-store` 持久化文件可正常写入。
3. 确认是否在登录后又主动执行了“退出当前环境”。
4. 若已升级旧版本数据，确认本次模拟器资源已完整替换。

### 5.3 已登录但产品列表为空

排查顺序：

1. 确认当前租户下是否确实存在该协议产品。
2. 确认网关已发布 `DEVICE` 路由。
3. 直接检查 `/DEVICE/api/v1/products/list` 是否正常返回分页数据。
4. 若返回 401 或 token 失效，重新登录当前环境。

### 5.4 `ProductSecret` 拉取失败

排查顺序：

1. 确认当前登录用户具备产品读取权限。
2. 确认目标产品认证方式为 `PRODUCT_SECRET`。
3. 确认 `/DEVICE/api/v1/products/{id}/secret` 可正常访问。

### 5.5 切换环境后导入设备默认地址仍是旧值

本次只对“缺省值”做环境联动：

- 导入文件中已显式写入的地址不会被环境覆盖。
- 仅当导入记录缺失对应地址字段时，才会回退到当前环境默认值。

## 6. 回滚说明

如需回滚本次能力，需要同时回滚：

- `firefly-simulator/src/workspaceStore.ts`
- `firefly-simulator/src/storage.ts`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/electron/main.ts`
- `firefly-simulator/electron/preload.ts`
- `firefly-simulator/src/vite-env.d.ts`

回滚后重新执行：

```bash
cd firefly-simulator
npm run build:vite
```
