package com.songhg.firefly.iot.device.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * OTA 相关配置：固件摘要签名校验使用的公钥与算法。
 *
 * <p>未配置公钥时仅允许「无签名 + 摘要」模式；一旦固件携带签名却没有配置公钥，
 * 校验会直接失败，避免签名被静默忽略。</p>
 */
@Data
@Component
@ConfigurationProperties(prefix = "firefly.ota")
public class OtaProperties {

    /**
     * 固件摘要签名公钥（PEM，支持 X.509 SubjectPublicKeyInfo）。
     */
    private String signaturePublicKey;

    /**
     * 签名算法，默认 RSA-SHA256。
     */
    private String signatureAlgorithm = "SHA256withRSA";
}
