package com.songhg.firefly.iot.common.security;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 内部服务访问凭据配置。
 * 业务服务的 {@code /api/v1/internal/**} 接口仅接受携带该令牌的服务间调用。
 */
@Data
@Component
@ConfigurationProperties(prefix = "firefly.internal")
public class InternalAuthProperties {

    /**
     * 服务间共享令牌。为空时内部接口一律拒绝（fail-closed），需通过 FIREFLY_INTERNAL_TOKEN 配置。
     */
    private String token;
}
