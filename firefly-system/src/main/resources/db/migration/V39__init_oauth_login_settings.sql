-- ============================================================
-- V39: initialize third-party oauth login settings
-- ============================================================

INSERT INTO system_configs (tenant_id, config_group, config_key, config_value, value_type, description)
VALUES
    (0, 'security', 'security.oauth.wechat.enabled', 'false', 'BOOLEAN', '是否启用微信网页登录'),
    (0, 'security', 'security.oauth.wechat.app_id', '', 'STRING', '微信开放平台 AppID'),
    (0, 'security', 'security.oauth.wechat.app_secret', '', 'STRING', '微信开放平台 AppSecret'),
    (0, 'security', 'security.oauth.wechat-mini.enabled', 'false', 'BOOLEAN', '是否启用微信小程序登录'),
    (0, 'security', 'security.oauth.wechat-mini.app_id', '', 'STRING', '微信小程序 AppID'),
    (0, 'security', 'security.oauth.wechat-mini.app_secret', '', 'STRING', '微信小程序 AppSecret'),
    (0, 'security', 'security.oauth.dingtalk.enabled', 'false', 'BOOLEAN', '是否启用钉钉登录'),
    (0, 'security', 'security.oauth.dingtalk.client_id', '', 'STRING', '钉钉应用 Client ID'),
    (0, 'security', 'security.oauth.dingtalk.client_secret', '', 'STRING', '钉钉应用 Client Secret'),
    (0, 'security', 'security.oauth.alipay.enabled', 'false', 'BOOLEAN', '是否启用支付宝登录'),
    (0, 'security', 'security.oauth.alipay.app_id', '', 'STRING', '支付宝开放平台 AppID'),
    (0, 'security', 'security.oauth.alipay.private_key_pem', '', 'STRING', '支付宝开放平台 RSA2 私钥 PEM'),
    (0, 'security', 'security.oauth.alipay.gateway', 'https://openapi.alipay.com/gateway.do', 'STRING', '支付宝开放平台网关地址'),
    (0, 'security', 'security.oauth.apple.enabled', 'false', 'BOOLEAN', '是否启用 Apple 登录'),
    (0, 'security', 'security.oauth.apple.client_id', '', 'STRING', 'Apple Services ID / Bundle ID')
ON CONFLICT (tenant_id, config_key) DO NOTHING;
