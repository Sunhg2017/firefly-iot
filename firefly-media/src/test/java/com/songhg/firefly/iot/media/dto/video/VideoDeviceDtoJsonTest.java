package com.songhg.firefly.iot.media.dto.video;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.enums.StreamMode;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

class VideoDeviceDtoJsonTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void createDtoShouldAcceptCommonSipFieldAliases() throws Exception {
        String payload = """
                {
                  "name": "north-gate-camera",
                  "product_key": "camera.pk",
                  "gbdeviceid": "34020000001320000001",
                  "gb_domain": "3402000000",
                  "sipauthenabled": true,
                  "sippassword": "sip-secret",
                  "stream_mode": "GB28181"
                }
                """;

        VideoDeviceCreateDTO dto = objectMapper.readValue(payload, VideoDeviceCreateDTO.class);

        assertThat(dto.getProductKey()).isEqualTo("camera.pk");
        assertThat(dto.getGbDeviceId()).isEqualTo("34020000001320000001");
        assertThat(dto.getGbDomain()).isEqualTo("3402000000");
        assertThat(dto.getSipAuthEnabled()).isTrue();
        assertThat(dto.getSipPassword()).isEqualTo("sip-secret");
        assertThat(dto.getStreamMode()).isEqualTo(StreamMode.GB28181);
    }

    @Test
    void updateDtoShouldAcceptCommonSipFieldAliases() throws Exception {
        String payload = """
                {
                  "gb_device_id": "34020000001320000002",
                  "sip_auth_enabled": true,
                  "sip_password": "updated-secret",
                  "streammode": "GB28181"
                }
                """;

        VideoDeviceUpdateDTO dto = objectMapper.readValue(payload, VideoDeviceUpdateDTO.class);

        assertThat(dto.getGbDeviceId()).isEqualTo("34020000001320000002");
        assertThat(dto.getSipAuthEnabled()).isTrue();
        assertThat(dto.getSipPassword()).isEqualTo("updated-secret");
        assertThat(dto.getStreamMode()).isEqualTo(StreamMode.GB28181);
    }
}
