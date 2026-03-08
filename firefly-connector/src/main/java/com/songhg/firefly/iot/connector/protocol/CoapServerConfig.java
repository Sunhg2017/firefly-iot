package com.songhg.firefly.iot.connector.protocol;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Configuration;

/**
 * CoAP 服务器配置
 * <p>
 * 配置项 (application.yml):
 * <pre>
 * firefly:
 *   coap:
 *     enabled: true
 *     port: 5683
 *     secure-port: 5684
 *     max-message-size: 1024
 *     block-size: 512
 *     dtls-enabled: false
 * </pre>
 * <p>
 * 集成 Eclipse Californium 时需添加依赖:
 * <pre>
 * &lt;dependency&gt;
 *     &lt;groupId&gt;org.eclipse.californium&lt;/groupId&gt;
 *     &lt;artifactId&gt;californium-core&lt;/artifactId&gt;
 *     &lt;version&gt;3.11.0&lt;/version&gt;
 * &lt;/dependency&gt;
 * &lt;dependency&gt;
 *     &lt;groupId&gt;org.eclipse.californium&lt;/groupId&gt;
 *     &lt;artifactId&gt;scandium&lt;/artifactId&gt;
 *     &lt;version&gt;3.11.0&lt;/version&gt;
 * &lt;/dependency&gt;
 * </pre>
 */
@Data
@Configuration
@ConfigurationProperties(prefix = "firefly.coap")
public class CoapServerConfig {

    private boolean enabled = false;
    private int port = 5683;
    private int securePort = 5684;
    private int maxMessageSize = 1024;
    private int blockSize = 512;
    private boolean dtlsEnabled = false;
}
