package com.songhg.firefly.iot.media.config;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ZlmPropertiesTest {

    @Test
    void shouldUseApiHostAndApiPortWhenProvided() {
        ZlmProperties properties = new ZlmProperties();
        properties.setHost("media.example.com");
        properties.setPort(18080);
        properties.setApiHost("zlmediakit");
        properties.setApiPort(80);

        assertEquals("http://zlmediakit:80", properties.getApiUrl());
    }

    @Test
    void shouldFallbackToHostAndPortWhenApiAddressMissing() {
        ZlmProperties properties = new ZlmProperties();
        properties.setHost("192.168.1.10");
        properties.setPort(18080);

        assertEquals("http://192.168.1.10:18080", properties.getApiUrl());
    }
}
