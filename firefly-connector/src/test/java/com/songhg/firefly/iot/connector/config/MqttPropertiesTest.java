package com.songhg.firefly.iot.connector.config;

import com.songhg.firefly.iot.connector.config.MqttProperties.ClientAuthMode;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class MqttPropertiesTest {

    @Test
    void shouldNotValidateWhenTlsDisabled() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(false);

        assertDoesNotThrow(props::validateTlsConfig);
    }

    @Test
    void shouldRejectTlsWithoutKeyStorePath() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(true);
        props.setKeyStorePassword("testpass");

        assertThrows(IllegalStateException.class, props::validateTlsConfig);
    }

    @Test
    void shouldRejectTlsWithoutKeyStorePassword() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(true);
        props.setKeyStorePath("server.jks");

        assertThrows(IllegalStateException.class, props::validateTlsConfig);
    }

    @Test
    void shouldRejectMutualAuthWithoutTrustStore() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(true);
        props.setKeyStorePath("server.jks");
        props.setKeyStorePassword("testpass");
        props.setClientAuth(ClientAuthMode.REQUIRE);
        props.setTrustStorePassword("testpass");

        assertThrows(IllegalStateException.class, props::validateTlsConfig);
    }

    @Test
    void shouldRejectMutualAuthWithoutTrustStorePassword() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(true);
        props.setKeyStorePath("server.jks");
        props.setKeyStorePassword("testpass");
        props.setClientAuth(ClientAuthMode.REQUIRE);
        props.setTrustStorePath("truststore.jks");

        assertThrows(IllegalStateException.class, props::validateTlsConfig);
    }

    @Test
    void shouldAcceptCompleteOneWayTlsConfig() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(true);
        props.setKeyStorePath("server.jks");
        props.setKeyStorePassword("testpass");

        assertDoesNotThrow(props::validateTlsConfig);
    }

    @Test
    void shouldAcceptCompleteMutualAuthConfig() {
        MqttProperties props = new MqttProperties();
        props.setSslEnabled(true);
        props.setKeyStorePath("server.jks");
        props.setKeyStorePassword("testpass");
        props.setClientAuth(ClientAuthMode.REQUIRE);
        props.setTrustStorePath("truststore.jks");
        props.setTrustStorePassword("testpass");

        assertDoesNotThrow(props::validateTlsConfig);
    }

    @Test
    void shouldFallbackKeyManagerPasswordToKeyStorePassword() {
        MqttProperties props = new MqttProperties();
        props.setKeyStorePassword("testpass");

        assertEquals("testpass", props.effectiveKeyManagerPassword());
    }

    @Test
    void shouldPreferExplicitKeyManagerPassword() {
        MqttProperties props = new MqttProperties();
        props.setKeyStorePassword("testpass");
        props.setKeyManagerPassword("keypass");

        assertEquals("keypass", props.effectiveKeyManagerPassword());
    }
}
