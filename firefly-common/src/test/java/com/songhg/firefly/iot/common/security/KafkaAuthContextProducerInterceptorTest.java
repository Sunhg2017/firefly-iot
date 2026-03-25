package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashSet;

import static org.assertj.core.api.Assertions.assertThat;

class KafkaAuthContextProducerInterceptorTest {

    private final KafkaAuthContextProducerInterceptor interceptor = new KafkaAuthContextProducerInterceptor();

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void shouldWriteHeadersFromCurrentAppContext() {
        AppContext context = new AppContext();
        context.setTenantId(101L);
        context.setUserId(202L);
        context.setUsername("video-admin");
        context.setPlatform(AuthConstants.PLATFORM_WEB);
        context.setPermissions(new LinkedHashSet<>(java.util.List.of("video:create", "video:read")));
        AppContextHolder.set(context);

        ProducerRecord<String, String> record = new ProducerRecord<>("video.topic", "key", "{\"tenantId\":1}");
        interceptor.onSend(record);

        assertThat(headerValue(record, AuthConstants.HEADER_TENANT_ID)).isEqualTo("101");
        assertThat(headerValue(record, AuthConstants.HEADER_USER_ID)).isEqualTo("202");
        assertThat(headerValue(record, AuthConstants.HEADER_USERNAME)).isEqualTo("video-admin");
        assertThat(headerValue(record, AuthConstants.HEADER_PLATFORM)).isEqualTo(AuthConstants.PLATFORM_WEB);
        assertThat(headerValue(record, AuthConstants.HEADER_GRANTED_PERMISSIONS)).isEqualTo("video:create,video:read");
    }

    @Test
    void shouldFallbackToPayloadContextWhenThreadContextIsMissing() {
        ProducerRecord<String, String> record = new ProducerRecord<>(
                "event.topic",
                "key",
                "{\"tenantId\":303,\"operatorId\":404,\"username\":\"rule-user\",\"platform\":\"OPEN_API\"}"
        );

        interceptor.onSend(record);

        assertThat(headerValue(record, AuthConstants.HEADER_TENANT_ID)).isEqualTo("303");
        assertThat(headerValue(record, AuthConstants.HEADER_USER_ID)).isEqualTo("404");
        assertThat(headerValue(record, AuthConstants.HEADER_USERNAME)).isEqualTo("rule-user");
        assertThat(headerValue(record, AuthConstants.HEADER_PLATFORM)).isEqualTo("OPEN_API");
    }

    private String headerValue(ProducerRecord<String, String> record, String headerName) {
        if (record.headers().lastHeader(headerName) == null) {
            return null;
        }
        return new String(record.headers().lastHeader(headerName).value(), StandardCharsets.UTF_8);
    }
}
