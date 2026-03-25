package com.songhg.firefly.iot.common.security;

import com.songhg.firefly.iot.common.constant.AuthConstants;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import org.apache.kafka.clients.consumer.ConsumerRecord;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;

class KafkaAuthContextRecordInterceptorTest {

    private final KafkaAuthContextRecordInterceptor interceptor = new KafkaAuthContextRecordInterceptor();

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void shouldRestoreAppContextFromHeadersPerRecord() {
        ConsumerRecord<String, String> record = new ConsumerRecord<>("video.topic", 0, 0L, "key", "{\"tenantId\":1}");
        record.headers().add(AuthConstants.HEADER_TENANT_ID, "501".getBytes(StandardCharsets.UTF_8));
        record.headers().add(AuthConstants.HEADER_USER_ID, "601".getBytes(StandardCharsets.UTF_8));
        record.headers().add(AuthConstants.HEADER_USERNAME, "mq-user".getBytes(StandardCharsets.UTF_8));
        record.headers().add(AuthConstants.HEADER_GRANTED_PERMISSIONS, "video:create,video:read".getBytes(StandardCharsets.UTF_8));

        interceptor.intercept(record, null);

        assertThat(AppContextHolder.getTenantId()).isEqualTo(501L);
        assertThat(AppContextHolder.getUserId()).isEqualTo(601L);
        assertThat(AppContextHolder.getUsername()).isEqualTo("mq-user");
        assertThat(AppContextHolder.getPermissions()).containsExactly("video:create", "video:read");

        interceptor.afterRecord(record, null);

        assertThat(AppContextHolder.get()).isNull();
    }

    @Test
    void shouldFallbackToPayloadContextWhenHeadersAreMissing() {
        ConsumerRecord<String, String> record = new ConsumerRecord<>(
                "rule.topic",
                0,
                0L,
                "key",
                "{\"tenantId\":701,\"operatorId\":801,\"username\":\"event-user\"}"
        );

        interceptor.intercept(record, null);

        assertThat(AppContextHolder.getTenantId()).isEqualTo(701L);
        assertThat(AppContextHolder.getUserId()).isEqualTo(801L);
        assertThat(AppContextHolder.getUsername()).isEqualTo("event-user");
    }
}
