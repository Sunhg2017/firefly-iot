package com.songhg.firefly.iot.connector.protocol.mqtt;

import com.songhg.firefly.iot.connector.config.MqttProperties;
import com.songhg.firefly.iot.connector.config.MqttProperties.ClientAuthMode;
import io.netty.buffer.UnpooledByteBufAllocator;
import io.netty.handler.ssl.SslContext;
import org.junit.jupiter.api.Test;

import javax.net.ssl.SSLEngine;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * 使用 src/test/resources/mqtt-tls 下的自签名证书 fixture 验证 TLS/mTLS 上下文构建。
 * 该证书仅用于单测，口令为公开的 testpass，不构成生产凭据。
 */
class FireflyMqttSslContextCreatorTest {

    private static final String KEYSTORE = "mqtt-tls/server.jks";
    private static final String TRUSTSTORE = "mqtt-tls/truststore.jks";
    private static final String PASSWORD = "testpass";

    private MqttProperties oneWayProps() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(true);
        props.setKeyStoreType("JKS");
        props.setKeyStorePath(KEYSTORE);
        props.setKeyStorePassword(PASSWORD);
        return props;
    }

    @Test
    void shouldBuildServerContextForOneWayTls() {
        SslContext context = new FireflyMqttSslContextCreator(oneWayProps()).initSSLContext();

        assertNotNull(context);
        SSLEngine engine = context.newEngine(UnpooledByteBufAllocator.DEFAULT);
        assertFalse(engine.getNeedClientAuth(), "单向 TLS 不应强制客户端证书");
    }

    @Test
    void shouldBuildContextRequiringClientAuthForMutualTls() {
        MqttProperties props = oneWayProps();
        props.setClientAuth(ClientAuthMode.REQUIRE);
        props.setTrustStoreType("JKS");
        props.setTrustStorePath(TRUSTSTORE);
        props.setTrustStorePassword(PASSWORD);

        SslContext context = new FireflyMqttSslContextCreator(props).initSSLContext();

        assertNotNull(context);
        SSLEngine engine = context.newEngine(UnpooledByteBufAllocator.DEFAULT);
        assertTrue(engine.getNeedClientAuth(), "双向认证（REQUIRE）应强制客户端证书");
    }

    @Test
    void shouldBuildContextRequestingClientAuthForOptionalMutualTls() {
        MqttProperties props = oneWayProps();
        props.setClientAuth(ClientAuthMode.OPTIONAL);
        props.setTrustStoreType("JKS");
        props.setTrustStorePath(TRUSTSTORE);
        props.setTrustStorePassword(PASSWORD);

        SslContext context = new FireflyMqttSslContextCreator(props).initSSLContext();

        assertNotNull(context);
        SSLEngine engine = context.newEngine(UnpooledByteBufAllocator.DEFAULT);
        assertFalse(engine.getNeedClientAuth(), "OPTIONAL 只请求客户端证书，不应强制");
        assertTrue(engine.getWantClientAuth(), "OPTIONAL 应请求客户端证书");
    }

    @Test
    void shouldFailWhenTrustStoreMissingForMutualTls() {
        MqttProperties props = oneWayProps();
        props.setClientAuth(ClientAuthMode.REQUIRE);

        assertThrows(IllegalStateException.class,
                () -> new FireflyMqttSslContextCreator(props).initSSLContext());
    }

    @Test
    void shouldFailWhenKeyStoreFileDoesNotExist() {
        MqttProperties props = oneWayProps();
        props.setKeyStorePath("mqtt-tls/does-not-exist.jks");

        assertThrows(IllegalStateException.class,
                () -> new FireflyMqttSslContextCreator(props).initSSLContext());
    }
}
