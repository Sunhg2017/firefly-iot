package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceLocation;
import com.songhg.firefly.iot.device.entity.GeoFence;
import com.songhg.firefly.iot.device.mapper.DeviceLocationMapper;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class DeviceLocationServiceTest {

    @Mock
    private DeviceLocationMapper locationMapper;

    @Mock
    private GeoFenceService geoFenceService;

    @Mock
    private DeviceMapper deviceMapper;

    @Mock
    private DeviceDataService deviceDataService;

    @Mock
    private DeviceMessageProducer messageProducer;

    @Test
    void shouldPersistLocationAndEmitGeoFenceEnterEventFromPropertyReport() {
        DeviceLocationService service = new DeviceLocationService(
                locationMapper,
                geoFenceService,
                deviceMapper,
                deviceDataService,
                messageProducer
        );
        Device device = buildDevice();
        DeviceLocation previousLocation = new DeviceLocation();
        previousLocation.setTenantId(100L);
        previousLocation.setDeviceId(10L);
        previousLocation.setLng(116.0);
        previousLocation.setLat(39.8);
        GeoFence fence = new GeoFence();
        fence.setId(501L);
        fence.setName("仓库A");
        fence.setFenceType("CIRCLE");
        fence.setTriggerType("BOTH");

        when(deviceMapper.selectByIdIgnoreTenant(10L)).thenReturn(device);
        when(locationMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(previousLocation);
        when(geoFenceService.listEnabled(100L)).thenReturn(List.of(fence));
        when(geoFenceService.isInside(eq(fence), eq(116.0), eq(39.8))).thenReturn(false);
        when(geoFenceService.isInside(eq(fence), eq(116.3), eq(39.9))).thenReturn(true);
        doAnswer(invocation -> {
            DeviceLocation location = invocation.getArgument(0);
            location.setId(9001L);
            return 1;
        }).when(locationMapper).insert(any(DeviceLocation.class));

        DeviceLocation location = service.syncLocationFromPropertyReport(DeviceMessage.builder()
                .messageId("msg-geo-1")
                .tenantId(100L)
                .productId(20L)
                .deviceId(10L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .topic("/sys/pk/dev-001/thing/property/post")
                .payload(Map.of("longitude", 116.3, "latitude", 39.9, "speed", 12.5))
                .timestamp(1_700_000_000_000L)
                .build());

        assertNotNull(location);
        assertEquals(100L, location.getTenantId());
        assertEquals(10L, location.getDeviceId());
        assertEquals("PROPERTY_REPORT", location.getSource());

        ArgumentCaptor<DeviceLocation> locationCaptor = ArgumentCaptor.forClass(DeviceLocation.class);
        verify(locationMapper).insert(locationCaptor.capture());
        assertEquals(116.3, locationCaptor.getValue().getLng());
        assertEquals(39.9, locationCaptor.getValue().getLat());

        ArgumentCaptor<DeviceMessage> eventCaptor = ArgumentCaptor.forClass(DeviceMessage.class);
        verify(deviceDataService).writeEventFromMessage(eventCaptor.capture());
        DeviceMessage eventMessage = eventCaptor.getValue();
        assertEquals(DeviceMessage.MessageType.EVENT_REPORT, eventMessage.getType());
        assertEquals("geofenceAlarm", eventMessage.getPayload().get("eventType"));
        assertEquals("仓库A", eventMessage.getPayload().get("fenceName"));
        assertEquals("0", eventMessage.getPayload().get("transition"));

        verify(messageProducer).publishToTopic(eq(KafkaTopics.RULE_ENGINE_INPUT), any(DeviceMessage.class));
    }

    @Test
    void shouldPersistLocationWithoutGeoFenceEventWhenNoPreviousLocationExists() {
        DeviceLocationService service = new DeviceLocationService(
                locationMapper,
                geoFenceService,
                deviceMapper,
                deviceDataService,
                messageProducer
        );

        when(deviceMapper.selectByIdIgnoreTenant(10L)).thenReturn(buildDevice());
        when(locationMapper.selectOne(any(LambdaQueryWrapper.class))).thenReturn(null);

        DeviceLocation location = service.syncLocationFromPropertyReport(DeviceMessage.builder()
                .tenantId(100L)
                .productId(20L)
                .deviceId(10L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .payload(Map.of("lng", 116.3, "lat", 39.9))
                .timestamp(1_700_000_000_000L)
                .build());

        assertNotNull(location);
        verify(locationMapper).insert(any(DeviceLocation.class));
        verify(deviceDataService, never()).writeEventFromMessage(any(DeviceMessage.class));
        verify(messageProducer, never()).publishToTopic(eq(KafkaTopics.RULE_ENGINE_INPUT), any(DeviceMessage.class));
    }

    @Test
    void shouldIgnorePropertyReportWithoutCoordinates() {
        DeviceLocationService service = new DeviceLocationService(
                locationMapper,
                geoFenceService,
                deviceMapper,
                deviceDataService,
                messageProducer
        );

        DeviceLocation location = service.syncLocationFromPropertyReport(DeviceMessage.builder()
                .tenantId(100L)
                .productId(20L)
                .deviceId(10L)
                .deviceName("dev-001")
                .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                .payload(Map.of("temperature", 28.5))
                .timestamp(1_700_000_000_000L)
                .build());

        assertNull(location);
        verify(deviceMapper, never()).selectByIdIgnoreTenant(anyLong());
        verify(locationMapper, never()).insert(any(DeviceLocation.class));
    }

    private Device buildDevice() {
        Device device = new Device();
        device.setId(10L);
        device.setTenantId(100L);
        device.setProductId(20L);
        device.setDeviceName("dev-001");
        return device;
    }
}
