# 设备模拟器运维说明

> 版本: v1.0.0
> 日期: 2026-03-13
> 状态: Done

## 1. 适用范围

本文档用于设备模拟器模块的构建验证、发布检查、常见问题排查和回滚说明。

## 2. 本次优化内容

- 新建模拟设备由弹窗改为抽屉式分步配置。
- 复杂协议配置拆分为“基本信息 / 接入参数 / 扩展配置”三步。
- 设备列表入口文案统一为中文。
- WebSocket 内部识别参数移入高级步骤。
- 设备管理器主视角升级为总览卡片、状态卡片目录和统计状态条。

## 3. 构建验证

执行：

```bash
cd firefly-simulator
npm run build:vite
```

通过标准：

- renderer 构建成功
- electron main/preload 构建成功
- 没有 TypeScript 类型错误

## 4. 回归检查

### 4.1 新建设备流程

重点检查：

- 点击“新建”后打开抽屉，而不是弹窗
- 步骤显示为三步
- 基本信息填写完成后才能进入下一步
- 已完成步骤支持回退修改
- 最终点击“创建设备”后能成功加入设备列表
- HTTP / CoAP / MQTT 设备如果缺少接入参数，连接按钮会直接提示缺项，而不是继续向服务端发送空认证请求
- HTTP 设备切换为“一型一密”后，连接流程应先动态注册成功，再进入 HTTP 鉴权

### 4.2 协议分支

重点检查：

- HTTP / CoAP：显示三元组鉴权字段
- MQTT：按认证方式切换 `deviceSecret` / `productSecret`
- Video：
  - RTSP 模式只要求 RTSP 源地址
  - GB28181 模式显示 SIP 和通道配置
- WebSocket：内部识别参数只出现在扩展配置步骤

### 4.3 列表与入口

重点检查：

- 顶部标题、导入导出按钮、批量连接按钮显示中文
- 筛选与空态文案显示中文
- 复制、删除、导入导出成功/失败提示显示中文
- 左侧顶部先显示总览卡片，再显示搜索和筛选区
- 设备列表项显示协议、状态、关键标识和发送数
- 底部状态条显示设备总量、协议分布、发送统计和快捷键

## 5. 常见问题排查

### 5.0 开发态出现 Electron CSP 警告

当前模拟器入口页已经补充显式 Content-Security-Policy。

如果本地仍看到旧的 `Insecure Content-Security-Policy` 告警，优先排查：

1. 开发进程是否仍在使用旧页面缓存
2. Electron 窗口是否在本次修改前就已经打开，未完全重启
3. 是否加载了非本仓库生成的旧 `index.html`

### 5.0.1 小窗口下中间工作区变得很窄

本次已经调整为：

- 主工作区和状态栏改为上下结构，不再横向并列
- 右侧工作区增加 `minWidth: 0`，避免被兄弟节点挤压
- 状态栏允许换行，避免在窄宽度下继续压缩主区域

如果仍看到旧现象，优先确认是否还在使用旧版打包资源。

### 5.0.2 新建设备抽屉底部出现白色块

该现象通常是抽屉 `footer` 沿用了 Ant Design 默认浅色背景，和模拟器当前深色工作台主题不一致。

排查顺序：

1. 确认 `AddDeviceModal` 是否同时覆盖了 `header`、`body`、`footer` 三个区域的样式
2. 确认本地运行的 renderer 资源已经更新，而不是旧缓存页面
3. 如为二次开发新增抽屉，检查是否仍直接使用组件默认 `footer` 样式

### 5.0.3 新建设备表单中部出现白色卡片

该现象通常不是抽屉底栏，而是协议说明卡片或配置摘要卡片沿用了浅色背景，例如 `#fafafa`。

排查顺序：

1. 检查 `AddDeviceModal` 中协议说明卡片和配置摘要卡片是否统一复用了深色面板样式
2. 检查卡片文字颜色是否仍依赖全局深色主题，避免出现“白底浅字”的不可读组合
3. 如本地仍显示旧样式，重启开发进程并确认 renderer 资源已更新

### 5.0.4 HTTP 认证时服务端拿不到参数

优先按下面顺序排查：

1. 在设备控制区的“接入概览”确认 `服务地址 / ProductKey / DeviceName / DeviceSecret` 是否完整
2. 查看左侧设备卡片副标题是否仍显示“待补充 ...”，如果是，先补齐配置再重试
3. 打开 HTTP 请求历史，确认认证请求中是否已经带上认证参数预览
4. 确认 connector 已更新到兼容 body + query 双通道取参的版本
5. 如仍失败，再排查 firefly-device 内部认证接口返回的具体错误码

### 5.0.5 HTTP 一型一密无法连接

排查顺序：

1. 确认产品本身的设备认证方式为 `PRODUCT_SECRET`
2. 确认 `httpRegisterBaseUrl`、`productKey`、`productSecret`、`deviceName` 已填写完整
3. 确认 `/api/v1/protocol/device/register` 返回了新的 `deviceSecret`
4. 再查看后续 `/api/v1/protocol/http/auth` 是否成功拿到 token

### 5.1 新建抽屉无法下一步

先确认当前步骤的必填项是否已填写，再看控制台是否有校验错误信息。

### 5.2 出现 `useForm is not connected to any Form element`

该问题通常表示表单实例已经创建，但实际表单节点尚未挂载或已销毁。

本次实现已经通过表单快照状态规避此问题；如果再次出现，优先检查是否在抽屉关闭后继续使用 `useWatch`、`getFieldsValue` 或其他直接依赖 `form` 挂载状态的调用。

### 5.3 MQTT 一型一密创建后连接失败

排查顺序：

1. 确认动态注册地址是否正确
2. 确认 `productKey` 和 `productSecret` 是否匹配
3. 确认注册接口 `/api/v1/protocol/device/register` 可用
4. 确认 Broker 地址是否可达

### 5.4 WebSocket 连接不上

排查顺序：

1. 确认 `wsEndpoint` 是否正确
2. 确认是否需要 `deviceId / productId / tenantId`
3. 确认 connector 已暴露 `/ws/device`

### 5.5 GB28181 配置过长

这是本次拆步后的预期行为。先完成基础视频模式配置，再在高级步骤维护 SIP 和通道参数。

## 6. 回滚说明

如需回滚本次优化，需同时回滚：

- `firefly-simulator/src/components/AddDeviceModal.tsx`
- `firefly-simulator/src/components/DeviceListPanel.tsx`
- `firefly-simulator/README.md`
- `docs/design/detailed-design-device-simulator.md`
- `docs/operations/device-simulator-operations.md`
- `docs/user-guide/device-simulator-guide.md`

回滚后建议重新执行 `npm run build:vite`。
## 7. 2026-03-14 运维补充

### 7.1 动态注册删除链路检查

- connector 需要提供 `POST /api/v1/protocol/device/unregister`
- device 需要提供 `POST /api/v1/internal/device-auth/dynamic-unregister`
- 上述两个服务升级需同时发布，否则模拟器删除动态注册设备时会只删本地或提示失败

### 7.2 典型排查

- 现象：模拟器删除后平台设备仍然存在
- 排查顺序：
  1. 确认该设备是否是一型一密动态注册创建
  2. 确认 connector 的注销接口是否返回成功
  3. 确认 device 服务是否能用 `productSecret` 校验通过
  4. 检查 device 服务日志里是否执行了 `DeviceService.deleteDevice`

### 7.3 回归验证

- 新建一台 HTTP 或 MQTT 一型一密设备，填写“模拟设备名称”
- 首次连接成功后断开，再次连接应直接成功，不能再报设备已存在
- 删除该设备后，平台设备列表中对应 `deviceName` 应被同步删除


## 8. 2026-03-19 物模型联动与生命周期事件运维补充

### 8.1 新增接口

- `firefly-connector`
  - `GET /api/v1/protocol/products/thing-model?productKey=...`
- `firefly-device`
  - `GET /api/v1/internal/products/{id}/basic`
  - `GET /api/v1/internal/products/thing-model?productKey=...`

上述链路为 connector 调 device 的 Feign 只读调用，返回产品物模型 JSON，供模拟器按 `productKey` 动态加载。

### 8.2 发布要求

- 需要同时发布 `firefly-device`，否则 connector 无法按 `productKey` 读取物模型。
- 需要同时发布 `firefly-connector`，否则模拟器无法获取物模型，也无法通过 HTTP heartbeat 刷新在线状态。
- 需要同步更新 `firefly-simulator` 桌面端资源，前端才会出现物模型模拟、生命周期事件和心跳配置入口。
- 需要执行 `firefly-device` 的最新 Flyway 迁移；其中 `V21__allow_reuse_deleted_device_name.sql` 会把 `devices` 表旧的全量唯一约束替换成仅对 `deleted_at IS NULL` 生效的唯一索引，避免逻辑删除设备阻塞重新注册。

### 8.3 回归检查项

- HTTP / CoAP / MQTT 模拟设备连接后，应能看到对应的 `online` 事件。
- 主动点击断开后，应能看到对应的 `offline` 事件。
- 设备在线一段时间后，应持续产生 `heartbeat` 事件。
- HTTP 心跳除发送事件外，还应调用 `/api/v1/protocol/http/heartbeat`，确保 connector 在线态刷新正常。

### 8.4 故障排查

- 模拟器提示物模型加载失败或界面没有候选属性、事件
  - 先确认设备已填写 `productKey`。
  - 再确认模拟器填写的协议基础地址可访问 connector。
  - 直接检查 connector 的 `/api/v1/protocol/products/thing-model` 是否可用。
  - 如 connector 正常，再检查 device 的 `/api/v1/internal/products/thing-model` 是否返回期望内容。

- HTTP 设备没有持续在线
  - 检查是否成功发送了 `heartbeat` 事件。
  - 检查 connector 日志中是否收到 heartbeat 请求。
  - 直接调用 `/api/v1/protocol/http/heartbeat` 验证认证 token 是否仍有效。

- MQTT 设备异常掉线后没有 `offline` 事件
  - 先区分是否为用户主动点击 `Disconnect`。
  - 若是 broker 或网络导致的异常断连，属于当前协议实现边界，无法在连接已关闭后保证补发 `offline`。

- 服务端已经删除设备，但模拟器仍提示鉴权失败
  - 一型一密设备会在检测到 `UNAUTHORIZED`、`INVALID_SECRET`、`DEVICE_NOT_FOUND` 一类失败后自动重走动态注册。
  - 如果仍失败，再检查 `productSecret`、动态注册地址和服务端产品是否还允许动态注册。

### 8.5 验证命令

```bash
cd firefly-simulator
npm run build:vite

cd ..
mvn -pl firefly-device,firefly-connector -am -DskipTests compile
mvn -pl firefly-device -Dtest=ProductServiceTest test
```
