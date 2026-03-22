package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateItemDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyQueryDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.service.DeviceLocatorService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceServiceTest {

    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final ProductMapper productMapper = mock(ProductMapper.class);
    private final DeviceLocatorService deviceLocatorService = mock(DeviceLocatorService.class);
    private final DeviceTagService deviceTagService = mock(DeviceTagService.class);
    private final DeviceGroupService deviceGroupService = mock(DeviceGroupService.class);
    private final DeviceService service =
            new DeviceService(deviceMapper, productMapper, deviceLocatorService, deviceTagService, deviceGroupService);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void enableDeviceShouldRebuildDynamicGroups() {
        Device device = new Device();
        device.setId(7L);
        device.setStatus(DeviceStatus.DISABLED);
        device.setDeviceName("dev-007");

        when(deviceMapper.selectById(7L)).thenReturn(device);

        service.enableDevice(7L);

        verify(deviceMapper).updateById(device);
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(7L);
    }

    @Test
    void updateRuntimeConnectionStateShouldRebuildDynamicGroups() {
        Device device = new Device();
        device.setId(8L);
        device.setTenantId(1L);
        device.setStatus(DeviceStatus.ACTIVE);
        device.setOnlineStatus(OnlineStatus.OFFLINE);

        when(deviceMapper.selectByIdIgnoreTenant(8L)).thenReturn(device);

        service.updateRuntimeConnectionState(1L, 8L, OnlineStatus.ONLINE, null);

        verify(deviceMapper).updateById(device);
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(8L);
    }

    @Test
    void updateRuntimeConnectionStateShouldActivateInactiveDeviceWhenItGoesOnline() {
        Device device = new Device();
        device.setId(9L);
        device.setTenantId(1L);
        device.setStatus(DeviceStatus.INACTIVE);
        device.setOnlineStatus(OnlineStatus.UNKNOWN);

        LocalDateTime occurredAt = LocalDateTime.of(2026, 3, 19, 11, 30, 0);
        when(deviceMapper.selectByIdIgnoreTenant(9L)).thenReturn(device);

        service.updateRuntimeConnectionState(1L, 9L, OnlineStatus.ONLINE, occurredAt);

        assertEquals(DeviceStatus.ACTIVE, device.getStatus());
        assertEquals(OnlineStatus.ONLINE, device.getOnlineStatus());
        assertEquals(occurredAt, device.getLastOnlineAt());
        assertEquals(occurredAt, device.getActivatedAt());
        verify(deviceMapper).updateById(device);
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(9L);
    }

    @Test
    void updateRuntimeConnectionStateShouldKeepExistingActivatedAtForActivatedDevice() {
        Device device = new Device();
        device.setId(10L);
        device.setTenantId(1L);
        device.setStatus(DeviceStatus.ACTIVE);
        device.setOnlineStatus(OnlineStatus.OFFLINE);
        device.setActivatedAt(LocalDateTime.of(2026, 3, 18, 9, 0, 0));

        LocalDateTime occurredAt = LocalDateTime.of(2026, 3, 19, 12, 0, 0);
        when(deviceMapper.selectByIdIgnoreTenant(10L)).thenReturn(device);

        service.updateRuntimeConnectionState(1L, 10L, OnlineStatus.ONLINE, occurredAt);

        assertEquals(DeviceStatus.ACTIVE, device.getStatus());
        assertEquals(occurredAt, device.getLastOnlineAt());
        assertNotNull(device.getActivatedAt());
        assertEquals(LocalDateTime.of(2026, 3, 18, 9, 0, 0), device.getActivatedAt());
        verify(deviceMapper).updateById(device);
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(10L);
    }

    @Test
    void createDeviceShouldBindLocatorsDuringRegistration() {
        Product product = new Product();
        product.setId(11L);

        DeviceCreateDTO dto = new DeviceCreateDTO();
        dto.setProductId(11L);
        dto.setDeviceName("dev-011");
        dto.setLocators(List.of(locator("IMEI", "860001234567890", true)));

        when(productMapper.selectById(11L)).thenReturn(product);
        when(deviceMapper.selectList(any())).thenReturn(List.of());
        when(deviceMapper.insert(any(Device.class))).thenAnswer(invocation -> {
            Device inserted = invocation.getArgument(0);
            inserted.setId(11L);
            return 1;
        });

        service.createDevice(dto);

        verify(deviceLocatorService).createBatch(eq(11L), any());
    }

    @Test
    void batchCreateDevicesShouldBindPerDeviceLocators() {
        Product product = new Product();
        product.setId(12L);

        DeviceBatchCreateItemDTO item = new DeviceBatchCreateItemDTO();
        item.setDeviceName("dev-012");
        item.setLocators(List.of(locator("MAC", "AA:BB:CC:DD:EE:FF", true)));

        DeviceBatchCreateDTO dto = new DeviceBatchCreateDTO();
        dto.setProductId(12L);
        dto.setDevices(List.of(item));

        when(productMapper.selectById(12L)).thenReturn(product);
        when(deviceMapper.selectList(any())).thenReturn(List.of());
        when(deviceMapper.insert(any(Device.class))).thenAnswer(invocation -> {
            Device inserted = invocation.getArgument(0);
            inserted.setId(12L);
            return 1;
        });

        service.batchCreateDevices(dto);

        verify(deviceLocatorService, times(1)).createBatch(eq(12L), any());
    }

    @Test
    void getDeviceTopologyShouldPreserveAncestorChainForMatchedSubDevice() {
        AppContextHolder.setTenantId(1L);

        Device gateway = device(21L, 101L, "gateway-21", null, DeviceStatus.ACTIVE, OnlineStatus.ONLINE);
        Device child = device(22L, 102L, "sensor-22", 21L, DeviceStatus.ACTIVE, OnlineStatus.OFFLINE);

        Product gatewayProduct = product(101L, "Gateway Product", "gateway-pk", NodeType.GATEWAY);
        Product childProduct = product(102L, "Sensor Product", "sensor-pk", NodeType.DEVICE);

        when(deviceMapper.selectList(any())).thenReturn(List.of(child), List.of(gateway), List.of());
        when(productMapper.selectBatchIds(any())).thenReturn(List.of(gatewayProduct, childProduct));

        DeviceTopologyQueryDTO query = new DeviceTopologyQueryDTO();
        query.setProductId(102L);

        DeviceTopologyVO topology = service.getDeviceTopology(query);

        assertEquals(1, topology.getOverview().getMatchedDevices());
        assertEquals(2, topology.getOverview().getVisibleDevices());
        assertEquals(1, topology.getRootNodes().size());
        assertEquals("gateway-21", topology.getRootNodes().get(0).getDeviceName());
        assertEquals(1, topology.getRootNodes().get(0).getChildren().size());
        assertEquals("sensor-22", topology.getRootNodes().get(0).getChildren().get(0).getDeviceName());
        assertEquals("gateway-21", topology.getRootNodes().get(0).getChildren().get(0).getGatewayDeviceName());
    }

    @Test
    void getDeviceTopologyShouldExpandMatchedGatewayWithDescendants() {
        AppContextHolder.setTenantId(1L);

        Device gateway = device(31L, 201L, "gateway-31", null, DeviceStatus.ACTIVE, OnlineStatus.ONLINE);
        Device child = device(32L, 202L, "meter-32", 31L, DeviceStatus.ACTIVE, OnlineStatus.OFFLINE);

        Product gatewayProduct = product(201L, "Edge Gateway", "edge-gw", NodeType.GATEWAY);
        Product childProduct = product(202L, "Energy Meter", "meter-pk", NodeType.DEVICE);

        when(deviceMapper.selectList(any())).thenReturn(List.of(gateway), List.of(child), List.of());
        when(productMapper.selectBatchIds(any())).thenReturn(List.of(gatewayProduct, childProduct));

        DeviceTopologyQueryDTO query = new DeviceTopologyQueryDTO();
        query.setProductId(201L);

        DeviceTopologyVO topology = service.getDeviceTopology(query);

        assertEquals(1, topology.getOverview().getMatchedDevices());
        assertEquals(2, topology.getOverview().getVisibleDevices());
        assertEquals(1, topology.getRootNodes().size());
        assertEquals(1, topology.getRootNodes().get(0).getChildren().size());
        assertEquals("meter-32", topology.getRootNodes().get(0).getChildren().get(0).getDeviceName());
        assertEquals(1, topology.getOverview().getGatewayDevices());
        assertEquals(1, topology.getOverview().getSubDevices());
    }

    private DeviceLocatorInputDTO locator(String type, String value, boolean primary) {
        DeviceLocatorInputDTO locator = new DeviceLocatorInputDTO();
        locator.setLocatorType(type);
        locator.setLocatorValue(value);
        locator.setPrimaryLocator(primary);
        return locator;
    }

    private Device device(
            Long id,
            Long productId,
            String deviceName,
            Long gatewayId,
            DeviceStatus status,
            OnlineStatus onlineStatus
    ) {
        Device device = new Device();
        device.setId(id);
        device.setTenantId(1L);
        device.setProductId(productId);
        device.setDeviceName(deviceName);
        device.setGatewayId(gatewayId);
        device.setStatus(status);
        device.setOnlineStatus(onlineStatus);
        return device;
    }

    private Product product(Long id, String name, String productKey, NodeType nodeType) {
        Product product = new Product();
        product.setId(id);
        product.setTenantId(1L);
        product.setName(name);
        product.setProductKey(productKey);
        product.setNodeType(nodeType);
        return product;
    }
}
