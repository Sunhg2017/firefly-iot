# 第三方登录接入实现设计

## 1. 背景

当前仓库的登录体系已经有：

- `PASSWORD`
- `SMS`
- `user_oauth_bindings`
- `qrcode_login_tickets`

但真实第三方登录链路、配置模型、绑定入口和 Web 回调入口没有落地，导致：

- 枚举里虽然存在 `WECHAT`、`WECHAT_MINI`、`DINGTALK`、`ALIPAY`、`APPLE`，实际无法使用。
- 控制台登录页只能账号密码和短信登录。
- 第三方账号绑定只有查询和解绑，没有创建能力。

## 2. 本次目标

- 补齐微信 Web、微信小程序、钉钉、支付宝、Apple 登录接口。
- 补齐第三方账号绑定接口和 Web 端绑定入口。
- 在系统设置中补齐第三方登录所需配置键。
- 在 Web 端补齐微信、钉钉的网页登录跳转与回调处理。
- 增加自动化测试，覆盖主要第三方登录与绑定链路。

## 3. 范围收口

本次实现按当前仓库已知约束收口，不引入猜测性的租户注册逻辑：

- 第三方账号已绑定时，可直接登录。
- 第三方返回唯一邮箱或手机号，且能唯一匹配本地用户时，自动补绑后登录。
- 既没有绑定、也无法唯一匹配本地用户时，不自动创建新用户。
- 原因是当前第三方登录请求里没有租户选择参数，无法安全决定新用户应落入哪个租户。

## 4. 后端方案

### 4.1 配置模型

新增 Flyway `V39__init_oauth_login_settings.sql`，补齐以下全局配置：

- `security.oauth.wechat.enabled`
- `security.oauth.wechat.app_id`
- `security.oauth.wechat.app_secret`
- `security.oauth.wechat-mini.enabled`
- `security.oauth.wechat-mini.app_id`
- `security.oauth.wechat-mini.app_secret`
- `security.oauth.dingtalk.enabled`
- `security.oauth.dingtalk.client_id`
- `security.oauth.dingtalk.client_secret`
- `security.oauth.alipay.enabled`
- `security.oauth.alipay.app_id`
- `security.oauth.alipay.private_key_pem`
- `security.oauth.alipay.gateway`
- `security.oauth.apple.enabled`
- `security.oauth.apple.client_id`

### 4.2 服务收口

新增 `OauthIntegrationService`，统一处理：

- 第三方平台调用
- Web OAuth state 票据生成与一次性消费
- 绑定查找、UnionID 关联、唯一邮箱/手机号映射
- 新绑定写入或老绑定资料刷新
- 交给 `AuthService.oauthLogin(...)` 完成最终会话签发

### 4.3 新增接口

认证接口：

- `GET /api/v1/auth/oauth/providers`
- `POST /api/v1/auth/oauth/authorize-url`
- `POST /api/v1/auth/wechat`
- `POST /api/v1/auth/wechat-mini`
- `POST /api/v1/auth/dingtalk`
- `POST /api/v1/auth/alipay`
- `POST /api/v1/auth/apple`

当前用户绑定接口：

- `POST /api/v1/user/oauth-bindings/authorize-url`
- `POST /api/v1/user/oauth-bindings`

网关匿名放行：

- `/SYSTEM/api/v1/auth/oauth/providers`
- `/SYSTEM/api/v1/auth/oauth/authorize-url`

这两个接口用于登录页加载可用提供商和拉起 Web 授权，必须保持匿名放行，否则登录页会在未登录状态下被网关直接返回 401。

### 4.4 登录解析规则

解析顺序固定为：

1. 按 `provider + openId + appId` 查精确绑定
2. 按 `provider + unionId` 查同主体绑定
3. 按第三方返回的唯一邮箱或手机号查本地用户
4. 都未命中则拒绝登录，并提示先使用已有方式登录后绑定

### 4.5 Web 端可直接承接的提供商

当前控制台直接支持 Web 授权跳转的只有：

- 微信 Web 扫码登录
- 钉钉 Web 扫码登录

以下提供商走客户端或小程序侧授权，再调用后端 API：

- 微信小程序
- 支付宝
- Apple

## 5. 前端方案

### 5.1 登录页

登录页增加“其他登录方式”，仅展示当前已启用且支持 Web 授权跳转的提供商按钮。

### 5.2 回调页

新增两个前端回调页面：

- `/login/oauth/callback`
- `/oauth/bind/callback`

职责：

- 读取 `provider/code/state`
- 调对应后端接口完成登录或绑定
- 成功后跳转首页或安全管理页

### 5.3 安全管理页

安全管理页新增“第三方绑定”标签页，展示：

- 已启用提供商
- 当前绑定状态
- 已绑定昵称
- 绑定时间
- 去绑定/解绑动作

## 6. 测试设计

新增 `OauthIntegrationServiceTest`，覆盖：

- 微信 Web 已绑定登录
- 微信小程序 UnionID 关联登录
- 钉钉账号绑定
- 支付宝邮箱映射登录
- Apple 已绑定登录
- 微信 Web 授权地址生成与 state 入库
- 未绑定且无本地映射时的失败分支

## 7. 风险与边界

- Apple 当前实现校验 `identityToken`，不做服务端 code exchange。
- 支付宝当前实现完成网关签名和用户信息查询，但未增加响应验签。
- 当前版本未实现 SSO/LDAP。
- 当前版本未实现扫码登录票据流转，仍保留后续扩展空间。
