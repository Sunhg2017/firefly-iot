package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.result.R;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class MqttWebhookControllerTest {

    private final MqttProtocolAdapter mqttAdapter = mock(MqttProtocolAdapter.class);
    private final DeviceAuthService authService = mock(DeviceAuthService.class);
    private final MqttWebhookController controller = new MqttWebhookController(mqttAdapter, authService);

    @Test
    void shouldAllowAclForOwnDeviceTopic() {
        when(mqttAdapter.isOwnTopic("dev-1.pk-1", "dev-1&pk-1", "/sys/pk-1/dev-1/thing/property/post"))
                .thenReturn(true);

        R<Map<String, Object>> response = controller.checkAcl(Map.of(
                "clientid", "dev-1.pk-1",
                "username", "dev-1&pk-1",
                "topic", "/sys/pk-1/dev-1/thing/property/post",
                "action", "publish"
        ));

        assertEquals("allow", response.getData().get("result"));
    }

    @Test
    void shouldDenyAclForOtherDeviceTopic() {
        when(mqttAdapter.isOwnTopic("dev-1.pk-1", "dev-1&pk-1", "/sys/pk-1/dev-2/thing/property/post"))
                .thenReturn(false);

        R<Map<String, Object>> response = controller.checkAcl(Map.of(
                "clientid", "dev-1.pk-1",
                "username", "dev-1&pk-1",
                "topic", "/sys/pk-1/dev-2/thing/property/post",
                "action", "publish"
        ));

        assertEquals("deny", response.getData().get("result"));
    }
}
