# 第三方登录接入运维说明

## 1. 适用范围

本文适用于 `firefly-system` 第三方登录接入上线后的配置、验证、排障与回滚。

## 2. 发布内容

本次发布包含：

- 第三方登录后端接口
- 第三方绑定接口
- Web 登录页微信/钉钉登录入口
- 安全管理页第三方绑定页签
- 第三方登录系统配置项

本次不包含：

- SSO/LDAP
- 二维码票据登录
- 第三方新用户自动注册到租户

## 3. 配置项

登录能力是否可用，取决于 `tenant_id = 0` 的系统配置。

微信 Web：

- `security.oauth.wechat.enabled`
- `security.oauth.wechat.app_id`
- `security.oauth.wechat.app_secret`

微信小程序：

- `security.oauth.wechat-mini.enabled`
- `security.oauth.wechat-mini.app_id`
- `security.oauth.wechat-mini.app_secret`

钉钉：

- `security.oauth.dingtalk.enabled`
- `security.oauth.dingtalk.client_id`
- `security.oauth.dingtalk.client_secret`

支付宝：

- `security.oauth.alipay.enabled`
- `security.oauth.alipay.app_id`
- `security.oauth.alipay.private_key_pem`
- `security.oauth.alipay.gateway`

Apple：

- `security.oauth.apple.enabled`
- `security.oauth.apple.client_id`

## 4. 发布前检查

1. 在第三方开放平台把回调地址加入白名单。
2. 在系统设置页填好对应提供商凭据。
3. 为已有平台账号先准备至少一个可登录的本地用户。
4. 若希望直接第三方登录，先使用账号密码或短信登录后完成一次绑定。

## 5. 验证步骤

后端测试：

```bash
cd /Users/shg/codeRepo/firefly-iot
mvn -pl firefly-system test
```

前端构建：

```bash
cd /Users/shg/codeRepo/firefly-iot/firefly-web
npm run build
```

手工验证：

1. 打开系统设置，确认第三方登录配置项已出现。
2. 打开登录页，确认仅已启用的微信/钉钉 Web 提供商显示在“其他登录方式”中。
3. 使用已有本地账号登录，进入安全管理页的“第三方绑定”，完成一次微信或钉钉绑定。
4. 退出登录后再次使用已绑定的第三方账号登录，确认可直接进入控制台。
5. 在安全管理页解绑该账号，确认再次第三方登录会失败并提示先绑定。
6. 若验证支付宝、Apple 或微信小程序，使用客户端侧授权结果调用对应后端 API，确认已绑定账号可登录。

## 6. 常见故障

### 6.1 登录页没有第三方按钮

检查：

- 对应 `security.oauth.*.enabled` 是否为 `true`
- 必填 `app_id/client_id`、密钥是否已保存
- 登录页请求 `/api/v1/auth/oauth/providers` 是否返回启用状态

### 6.2 第三方回调后提示 state 无效

检查：

- 是否重复使用同一次回调链接
- Redis 是否可用
- 浏览器是否在长时间停留后才继续授权

### 6.3 第三方授权成功但仍提示未绑定

检查：

- `user_oauth_bindings` 是否存在该 `provider/open_id/app_id`
- 第三方返回的邮箱或手机号是否能唯一匹配本地用户
- 是否误以为系统会自动创建租户用户

### 6.4 支付宝登录失败

检查：

- `security.oauth.alipay.private_key_pem` 是否为完整 PKCS8 PEM
- `security.oauth.alipay.gateway` 是否指向正确网关
- 支付宝应用是否已开通用户信息接口权限

### 6.5 Apple 登录失败

检查：

- `security.oauth.apple.client_id` 是否与签发 `identityToken` 的 audience 一致
- `identityToken` 是否过期
- 服务节点是否能访问 `https://appleid.apple.com/auth/keys`

## 7. 回滚说明

代码回滚时需要同时回滚：

- `firefly-system` 认证与会话控制器
- `firefly-system` 第三方登录服务与测试
- `firefly-web` 登录页、回调页、安全管理页
- `V39__init_oauth_login_settings.sql`

若仅回滚代码、不清理配置，不会影响数据库结构，但第三方登录入口会失效。

## 8. 运维提醒

- 当前实现不会为未绑定第三方账号自动创建新用户。
- 历史环境若需要让第三方登录立即可用，应先批量完成用户绑定。
- Web 控制台只直接承接微信、钉钉网页登录；其余提供商依赖客户端侧授权结果调用 API。
