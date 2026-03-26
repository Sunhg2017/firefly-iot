package com.songhg.firefly.iot.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.client.ProductClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.InternalDeviceCreateDTO;
import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.mybatis.DataScopeContext;
import com.songhg.firefly.iot.common.mybatis.DataScopeResolver;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceCreateDTO;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import com.songhg.firefly.iot.media.gb28181.SipCommandSender;
import com.songhg.firefly.iot.media.mapper.StreamSessionMapper;
import com.songhg.firefly.iot.media.mapper.VideoChannelMapper;
import com.songhg.firefly.iot.media.mapper.VideoDeviceMapper;
import com.songhg.firefly.iot.media.zlm.ZlmApiClient;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.ObjectProvider;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class VideoServiceTest {

    private final VideoDeviceMapper videoDeviceMapper = mock(VideoDeviceMapper.class);
    private final VideoChannelMapper videoChannelMapper = mock(VideoChannelMapper.class);
    private final StreamSessionMapper streamSessionMapper = mock(StreamSessionMapper.class);
    private final ProductClient productClient = mock(ProductClient.class);
    private final DeviceClient deviceClient = mock(DeviceClient.class);
    @SuppressWarnings("unchecked")
    private final ObjectProvider<DataScopeResolver> dataScopeResolverProvider = mock(ObjectProvider.class);
    private final ZlmApiClient zlmApiClient = mock(ZlmApiClient.class);
    private final FileClient fileClient = mock(FileClient.class);
    private final SipCommandSender sipCommandSender = mock(SipCommandSender.class);
    private final VideoService service = new VideoService(
            videoDeviceMapper,
            videoChannelMapper,
            streamSessionMapper,
            productClient,
            deviceClient,
            dataScopeResolverProvider,
            zlmApiClient,
            fileClient,
            sipCommandSender
    );

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void createDeviceShouldCarryCurrentScopeProjectAndGroupsToLinkedAsset() {
        AppContextHolder.setTenantId(11L);
        AppContextHolder.setUserId(22L);

        ProductBasicVO product = new ProductBasicVO();
        product.setId(301L);
        product.setProductKey("camera.pk");
        product.setProtocol("GB28181");
        product.setProjectId(null);

        DeviceBasicVO deviceBasic = new DeviceBasicVO();
        deviceBasic.setId(401L);

        DataScopeContext dataScope = new DataScopeContext();
        dataScope.setProjectIds(List.of(501L));
        dataScope.setGroupIds(List.of("601", "bad-group", "602"));

        DataScopeResolver resolver = mock(DataScopeResolver.class);
        when(dataScopeResolverProvider.getIfAvailable()).thenReturn(resolver);
        when(resolver.resolve(22L, 11L)).thenReturn(dataScope);
        when(productClient.getProductBasicByProductKey("camera.pk")).thenReturn(R.ok(product));
        when(deviceClient.createDevice(any(InternalDeviceCreateDTO.class))).thenReturn(R.ok(deviceBasic));

        VideoDeviceCreateDTO dto = new VideoDeviceCreateDTO();
        dto.setProductKey("camera.pk");
        dto.setName("南门摄像头");
        dto.setStreamMode(StreamMode.GB28181);

        service.createDevice(dto);

        ArgumentCaptor<InternalDeviceCreateDTO> captor = ArgumentCaptor.forClass(InternalDeviceCreateDTO.class);
        verify(deviceClient).createDevice(captor.capture());
        assertThat(captor.getValue().getProjectId()).isEqualTo(501L);
        assertThat(captor.getValue().getGroupIds()).containsExactly(601L, 602L);
        assertThat(captor.getValue().getNickname()).isEqualTo("南门摄像头");
    }

    @Test
    void createDeviceShouldRetainSipPasswordWhenSipAuthEnabled() {
        AppContextHolder.setTenantId(11L);
        AppContextHolder.setUserId(22L);

        ProductBasicVO product = new ProductBasicVO();
        product.setId(301L);
        product.setProductKey("camera.pk");
        product.setProtocol("GB28181");
        product.setProjectId(701L);

        DeviceBasicVO deviceBasic = new DeviceBasicVO();
        deviceBasic.setId(401L);

        when(productClient.getProductBasicByProductKey("camera.pk")).thenReturn(R.ok(product));
        when(deviceClient.createDevice(any(InternalDeviceCreateDTO.class))).thenReturn(R.ok(deviceBasic));

        VideoDeviceCreateDTO dto = new VideoDeviceCreateDTO();
        dto.setProductKey("camera.pk");
        dto.setName("南门摄像头");
        dto.setStreamMode(StreamMode.GB28181);
        dto.setGbDeviceId("34020000001320000001");
        dto.setSipAuthEnabled(true);
        dto.setSipPassword("sip-secret");

        service.createDevice(dto);

        ArgumentCaptor<VideoDevice> captor = ArgumentCaptor.forClass(VideoDevice.class);
        verify(videoDeviceMapper).insert(captor.capture());
        assertThat(captor.getValue().getSipPassword()).isEqualTo("sip-secret");
    }

    @Test
    void createDeviceShouldRejectDuplicatedGb28181Identity() {
        AppContextHolder.setTenantId(11L);
        AppContextHolder.setUserId(22L);
        when(videoDeviceMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(1L);

        VideoDeviceCreateDTO dto = new VideoDeviceCreateDTO();
        dto.setProductKey("camera.pk");
        dto.setName("南门摄像头");
        dto.setStreamMode(StreamMode.GB28181);
        dto.setGbDeviceId("34020000001320000001");

        assertThatThrownBy(() -> service.createDevice(dto))
                .isInstanceOf(BizException.class)
                .satisfies(error -> {
                    BizException bizException = (BizException) error;
                    assertThat(bizException.getCode()).isEqualTo(ResultCode.VIDEO_DEVICE_EXISTS.getCode());
                    assertThat(bizException.getMessage()).isEqualTo("当前 GB 设备编号已存在视频设备");
                });

        verify(deviceClient, never()).createDevice(any(InternalDeviceCreateDTO.class));
        verify(videoDeviceMapper, never()).insert(any(VideoDevice.class));
    }
}
