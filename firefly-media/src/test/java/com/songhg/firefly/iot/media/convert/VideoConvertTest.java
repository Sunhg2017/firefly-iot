package com.songhg.firefly.iot.media.convert;

import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.StreamStatus;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceCreateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceUpdateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceVO;
import com.songhg.firefly.iot.media.entity.StreamSession;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static org.assertj.core.api.Assertions.assertThat;

class VideoConvertTest {

    @Test
    void toDeviceEntityShouldRetainAllCriticalFields() {
        VideoDeviceCreateDTO dto = new VideoDeviceCreateDTO();
        dto.setDeviceId(11L);
        dto.setName("north-gate-camera");
        dto.setGbDeviceId("34020000001320000001");
        dto.setGbDomain("3402000000");
        dto.setTransport("TCP");
        dto.setSipPassword("sip-secret");
        dto.setStreamMode(StreamMode.GB28181);
        dto.setIp("10.10.10.1");
        dto.setPort(5060);
        dto.setManufacturer("hikvision");
        dto.setModel("DS-2CD");
        dto.setFirmware("v1");

        VideoDevice entity = VideoConvert.toDeviceEntity(dto);

        assertThat(entity.getDeviceId()).isEqualTo(11L);
        assertThat(entity.getName()).isEqualTo("north-gate-camera");
        assertThat(entity.getGbDeviceId()).isEqualTo("34020000001320000001");
        assertThat(entity.getGbDomain()).isEqualTo("3402000000");
        assertThat(entity.getTransport()).isEqualTo("TCP");
        assertThat(entity.getSipPassword()).isEqualTo("sip-secret");
        assertThat(entity.getStreamMode()).isEqualTo(StreamMode.GB28181);
        assertThat(entity.getIp()).isEqualTo("10.10.10.1");
        assertThat(entity.getPort()).isEqualTo(5060);
        assertThat(entity.getManufacturer()).isEqualTo("hikvision");
        assertThat(entity.getModel()).isEqualTo("DS-2CD");
        assertThat(entity.getFirmware()).isEqualTo("v1");
    }

    @Test
    void updateDeviceEntityShouldOnlyOverrideProvidedFields() {
        VideoDevice entity = new VideoDevice();
        entity.setName("old-name");
        entity.setGbDeviceId("old-gb");
        entity.setSipPassword("old-secret");
        entity.setTransport("UDP");
        entity.setIp("10.0.0.1");

        VideoDeviceUpdateDTO dto = new VideoDeviceUpdateDTO();
        dto.setName("new-name");
        dto.setSipPassword("new-secret");

        VideoConvert.updateDeviceEntity(dto, entity);

        assertThat(entity.getName()).isEqualTo("new-name");
        assertThat(entity.getSipPassword()).isEqualTo("new-secret");
        assertThat(entity.getGbDeviceId()).isEqualTo("old-gb");
        assertThat(entity.getTransport()).isEqualTo("UDP");
        assertThat(entity.getIp()).isEqualTo("10.0.0.1");
    }

    @Test
    void toDeviceVoShouldExposePersistedDeviceFields() {
        VideoDevice entity = new VideoDevice();
        entity.setId(21L);
        entity.setTenantId(31L);
        entity.setDeviceId(41L);
        entity.setName("camera");
        entity.setGbDeviceId("34020000001320000002");
        entity.setGbDomain("3402000000");
        entity.setTransport("UDP");
        entity.setSipPassword("secret");
        entity.setStreamMode(StreamMode.GB28181);
        entity.setIp("192.168.1.20");
        entity.setPort(5060);
        entity.setManufacturer("dahua");
        entity.setModel("ipc");
        entity.setFirmware("v2");
        entity.setStatus(VideoDeviceStatus.ONLINE);
        entity.setCreatedBy(51L);
        entity.setCreatedAt(LocalDateTime.of(2026, 3, 26, 21, 0));

        VideoDeviceVO vo = VideoConvert.toDeviceVO(entity);

        assertThat(vo.getId()).isEqualTo(21L);
        assertThat(vo.getTenantId()).isEqualTo(31L);
        assertThat(vo.getDeviceId()).isEqualTo(41L);
        assertThat(vo.getGbDeviceId()).isEqualTo("34020000001320000002");
        assertThat(vo.getSipAuthEnabled()).isTrue();
        assertThat(vo.getStreamMode()).isEqualTo(StreamMode.GB28181);
        assertThat(vo.getStatus()).isEqualTo(VideoDeviceStatus.ONLINE);
    }

    @Test
    void toSessionVoShouldRetainUrlsAndStatus() {
        StreamSession session = new StreamSession();
        session.setId(61L);
        session.setVideoDeviceId(21L);
        session.setChannelId("34020000001320000002");
        session.setStreamId("live_001");
        session.setStatus(StreamStatus.ACTIVE);
        session.setFlvUrl("http://flv");
        session.setHlsUrl("http://hls");
        session.setWebrtcUrl("http://rtc");

        assertThat(VideoConvert.toSessionVO(session).getFlvUrl()).isEqualTo("http://flv");
        assertThat(VideoConvert.toSessionVO(session).getHlsUrl()).isEqualTo("http://hls");
        assertThat(VideoConvert.toSessionVO(session).getWebrtcUrl()).isEqualTo("http://rtc");
        assertThat(VideoConvert.toSessionVO(session).getStatus()).isEqualTo(StreamStatus.ACTIVE);
    }
}
