package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.HttpProtocolProperties;
import com.songhg.firefly.iot.connector.protocol.dto.DeviceAuthResult;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ZSetOperations;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.argThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class HttpDeviceLifecycleServiceTest {

    private final HttpProtocolProperties properties = new HttpProtocolProperties();
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    @SuppressWarnings("unchecked")
    private final ZSetOperations<String, String> zSetOperations = mock(ZSetOperations.class);

    private final HttpDeviceLifecycleService lifecycleService =
            new HttpDeviceLifecycleService(properties, redisTemplate, messageProducer);

    @BeforeEach
    void setUp() {
        when(redisTemplate.opsForZSet()).thenReturn(zSetOperations);
    }

    @Test
    void shouldPublishImmediateOfflineWhenMarkerExists() {
        DeviceAuthResult auth = DeviceAuthResult.success(3L, 1L, 2L);
        when(redisTemplate.delete("connector:http:device:online:1:2:3")).thenReturn(true);

        lifecycleService.markOffline(auth, "manual_disconnect");

        verify(zSetOperations).remove("connector:http:device:last-seen", "1:2:3");
        verify(messageProducer).publishUpstream(argThat(message ->
                message.getType() == DeviceMessage.MessageType.DEVICE_OFFLINE
                        && "/sys/http/3/lifecycle/device_offline".equals(message.getTopic())
                        && "manual_disconnect".equals(message.getPayload().get("reason"))
                        && "HTTP".equals(message.getPayload().get("protocol"))
        ));
    }

    @Test
    void shouldSkipOfflinePublishWhenDeviceWasNotMarkedOnline() {
        DeviceAuthResult auth = DeviceAuthResult.success(3L, 1L, 2L);
        when(redisTemplate.delete("connector:http:device:online:1:2:3")).thenReturn(false);

        lifecycleService.markOffline(auth, "manual_disconnect");

        verify(zSetOperations).remove("connector:http:device:last-seen", "1:2:3");
        verify(messageProducer, never()).publishUpstream(any(DeviceMessage.class));
    }
}
