package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import com.songhg.firefly.iot.api.dto.InternalDeviceCreateDTO;
import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DataScopeType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScopeContext;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.message.PlatformEventPublisher;
import com.songhg.firefly.iot.common.mybatis.DataScopeResolver;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateItemDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTripleExportDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyQueryDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceVideoProfile;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceVideoChannelMapper;
import com.songhg.firefly.iot.device.mapper.DeviceVideoProfileMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.service.DeviceLocatorService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
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
    private final DeviceVideoProfileMapper deviceVideoProfileMapper = mock(DeviceVideoProfileMapper.class);
    private final DeviceVideoChannelMapper deviceVideoChannelMapper = mock(DeviceVideoChannelMapper.class);
    private final PlatformEventPublisher platformEventPublisher = mock(PlatformEventPublisher.class);
    private final DataScopeResolver dataScopeResolver = mock(DataScopeResolver.class);
    private final DeviceService service =
            new DeviceService(
                    deviceMapper,
                    productMapper,
                    deviceLocatorService,
                    deviceTagService,
                    deviceGroupService,
                    deviceVideoProfileMapper,
                    deviceVideoChannelMapper,
                    platformEventPublisher,
                    dataScopeResolver
            );

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void exportDeviceTriplesShouldApplyGroupAndVideoFilters() {
        AppContextHolder.setTenantId(1L);
        DeviceTripleExportDTO dto = new DeviceTripleExportDTO();
        dto.setGroupId(5L);
        dto.setExcludeVideo(true);

        DeviceVideoProfile videoProfile = new DeviceVideoProfile();
        videoProfile.setDeviceId(9L);

        when(deviceGroupService.listDeviceIdsByGroup(5L)).thenReturn(List.of(7L, 8L));
        when(deviceVideoProfileMapper.selectList(any())).thenReturn(List.of(videoProfile));
        when(deviceMapper.selectList(any())).thenReturn(List.of());

        assertTrue(service.exportDeviceTriples(dto).isEmpty());
        verify(deviceGroupService).listDeviceIdsByGroup(5L);
        verify(deviceVideoProfileMapper).selectList(any());
        verify(deviceMapper).selectList(any());
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
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(12L);
    }

    @Test
    void createDeviceFromInternalShouldSyncStaticGroupsAndRebuildDynamicGroups() {
        Product product = new Product();
        product.setId(13L);

        InternalDeviceCreateDTO dto = new InternalDeviceCreateDTO();
        dto.setProductId(13L);
        dto.setDeviceName("video-dev-013");
        dto.setGroupIds(List.of(101L, 102L, 103L));

        when(productMapper.selectById(13L)).thenReturn(product);
        when(deviceMapper.selectList(any())).thenReturn(List.of());
        when(deviceMapper.insert(any(Device.class))).thenAnswer(invocation -> {
            Device inserted = invocation.getArgument(0);
            inserted.setId(13L);
            return 1;
        });
        when(deviceGroupService.filterStaticGroupIds(dto.getGroupIds())).thenReturn(List.of(101L, 103L));

        service.createDeviceFromInternal(dto);

        verify(deviceGroupService).syncDeviceGroups(13L, List.of(101L, 103L));
        verify(deviceGroupService).rebuildDynamicGroupsForDevice(13L);
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

    @Test
    void projectScopeShouldNotGrantCrossProjectDeviceViaSharedProduct() {
        Device device = new Device();
        device.setId(11L);
        device.setProjectId(101L);
        device.setProductId(200L);
        device.setDeviceName("dev-011");
        when(deviceMapper.selectById(11L)).thenReturn(device);

        AppContext context = new AppContext();
        context.setUserId(5L);
        context.setTenantId(1L);
        AppContextHolder.set(context);

        DataScopeContext scope = new DataScopeContext();
        scope.setScopeType(DataScopeType.CUSTOM);
        scope.setProjectIds(List.of(100L));
        scope.setProductIds(List.of(200L));
        scope.setDeviceIds(List.of(10L));
        when(dataScopeResolver.resolve(5L, 1L)).thenReturn(scope);

        assertThrows(BizException.class, () -> service.getDeviceSecret(11L));
    }

    @Test
    void projectScopeAllowsDeviceInAuthorizedProject() {
        Device device = new Device();
        device.setId(10L);
        device.setProjectId(100L);
        device.setProductId(200L);
        device.setDeviceName("dev-010");
        device.setDeviceSecret("secret-010");
        when(deviceMapper.selectById(10L)).thenReturn(device);

        AppContext context = new AppContext();
        context.setUserId(5L);
        context.setTenantId(1L);
        AppContextHolder.set(context);

        DataScopeContext scope = new DataScopeContext();
        scope.setScopeType(DataScopeType.CUSTOM);
        scope.setProjectIds(List.of(100L));
        scope.setProductIds(List.of(200L));
        scope.setDeviceIds(List.of(10L));
        when(dataScopeResolver.resolve(5L, 1L)).thenReturn(scope);

        assertEquals("secret-010", service.getDeviceSecret(10L));
    }
}
