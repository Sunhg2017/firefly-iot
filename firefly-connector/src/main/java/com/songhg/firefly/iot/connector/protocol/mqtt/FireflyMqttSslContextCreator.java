package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.songhg.firefly.iot.connector.config.MqttProperties;
import io.moquette.broker.ISslContextCreator;
import io.netty.handler.ssl.ClientAuth;
import io.netty.handler.ssl.SslContext;
import io.netty.handler.ssl.SslContextBuilder;
import lombok.extern.slf4j.Slf4j;

import javax.net.ssl.KeyManagerFactory;
import javax.net.ssl.TrustManagerFactory;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileNotFoundException;
import java.io.InputStream;
import java.net.URL;
import java.security.KeyStore;
import java.util.Arrays;

/**
 * 内置 MQTT Broker 的 TLS/mTLS 上下文构建器。
 *
 * <p>与 Moquette 默认实现的关键差异：服务端证书（keystore）与受信任客户端 CA（truststore）分离，
 * 二者的口令与轮换生命周期互不影响；同时钉住 TLS 协议版本，避免回落到已废弃的 TLS 1.0/1.1。</p>
 *
 * <ul>
 *   <li>{@code client-auth=NONE}：只启用服务端证书（单向 TLS），不加载 truststore。</li>
 *   <li>{@code client-auth=OPTIONAL}：加载 truststore，请求客户端证书但不强制。</li>
 *   <li>{@code client-auth=REQUIRE}：加载 truststore，握手强制校验客户端证书（双向认证 / mTLS）。</li>
 * </ul>
 *
 * <p>该实现只使用 JDK 的 {@code JdkSslContext}（{@link SslContextBuilder#forServer(KeyManagerFactory)}），
 * 因此 keystore/truststore 支持 JKS 与 PKCS12 两种 {@link KeyStore} 类型，无需额外 OpenSSL 原生库。</p>
 */
@Slf4j
public class FireflyMqttSslContextCreator implements ISslContextCreator {

    private final MqttProperties props;

    public FireflyMqttSslContextCreator(MqttProperties props) {
        this.props = props;
    }

    @Override
    public SslContext initSSLContext() {
        try {
            KeyStore keyStore = loadStore(props.getKeyStorePath(), props.getKeyStoreType(),
                    props.getKeyStorePassword());
            KeyManagerFactory keyManagerFactory = KeyManagerFactory.getInstance(KeyManagerFactory.getDefaultAlgorithm());
            keyManagerFactory.init(keyStore, props.effectiveKeyManagerPassword().toCharArray());

            SslContextBuilder builder = SslContextBuilder.forServer(keyManagerFactory);

            if (props.getClientAuth() != MqttProperties.ClientAuthMode.NONE) {
                KeyStore trustStore = loadStore(props.getTrustStorePath(), props.getTrustStoreType(),
                        props.getTrustStorePassword());
                TrustManagerFactory trustManagerFactory = TrustManagerFactory.getInstance(
                        TrustManagerFactory.getDefaultAlgorithm());
                trustManagerFactory.init(trustStore);
                builder.trustManager(trustManagerFactory);
                builder.clientAuth(toNettyClientAuth(props.getClientAuth()));
            }

            builder.protocols(resolveProtocols());
            return builder.build();
        } catch (Exception ex) {
            throw new IllegalStateException("Failed to initialize MQTT TLS context: " + ex.getMessage(), ex);
        }
    }

    private ClientAuth toNettyClientAuth(MqttProperties.ClientAuthMode mode) {
        return switch (mode) {
            case REQUIRE -> ClientAuth.REQUIRE;
            case OPTIONAL -> ClientAuth.OPTIONAL;
            case NONE -> ClientAuth.NONE;
        };
    }

    private String[] resolveProtocols() {
        String raw = props.getProtocols();
        if (raw == null || raw.isBlank()) {
            return new String[]{"TLSv1.2", "TLSv1.3"};
        }
        return Arrays.stream(raw.split(","))
                .map(String::trim)
                .filter(protocol -> !protocol.isEmpty())
                .toArray(String[]::new);
    }

    private KeyStore loadStore(String path, String type, String password) throws Exception {
        String storeType = (type == null || type.isBlank()) ? KeyStore.getDefaultType() : type;
        KeyStore keyStore = KeyStore.getInstance(storeType);
        try (InputStream in = openResource(path)) {
            keyStore.load(in, password.toCharArray());
        }
        return keyStore;
    }

    /**
     * 优先从 classpath 读取（便于单元测试内置证书），否则按文件系统绝对/相对路径加载，
     * 匹配 Docker 部署下证书卷挂载到容器内路径的场景。
     */
    private InputStream openResource(String path) throws Exception {
        if (path == null || path.isBlank()) {
            throw new IllegalArgumentException("keystore/truststore path must not be blank");
        }
        URL resource = getClass().getClassLoader().getResource(path);
        if (resource != null) {
            return getClass().getClassLoader().getResourceAsStream(path);
        }
        File file = new File(path);
        if (!file.exists()) {
            throw new FileNotFoundException("keystore/truststore file not found: " + file.getAbsolutePath());
        }
        return new FileInputStream(file);
    }
}
