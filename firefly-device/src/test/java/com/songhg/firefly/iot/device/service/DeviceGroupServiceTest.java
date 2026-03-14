package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.entity.DeviceGroupMember;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMapper;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMemberMapper;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceGroupServiceTest {

    private final DeviceGroupMapper groupMapper = mock(DeviceGroupMapper.class);
    private final DeviceGroupMemberMapper memberMapper = mock(DeviceGroupMemberMapper.class);
    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final ProductMapper productMapper = mock(ProductMapper.class);
    private final DeviceGroupService service =
            new DeviceGroupService(groupMapper, memberMapper, deviceMapper, productMapper, new ObjectMapper());

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void syncDeviceGroupsShouldReplaceStaticMembershipsAndRefreshCounts() {
        AppContextHolder.setTenantId(1L);

        Device device = new Device();
        device.setId(10L);
        device.setTenantId(1L);

        DeviceGroup removedGroup = buildGroup(1L, "old-group", "STATIC");
        DeviceGroup keptGroup = buildGroup(2L, "kept-group", "STATIC");
        DeviceGroup addedGroup = buildGroup(3L, "new-group", "STATIC");

        when(deviceMapper.selectByIdIgnoreTenant(10L)).thenReturn(device);
        when(groupMapper.selectBatchIds(List.of(2L, 3L))).thenReturn(List.of(keptGroup, addedGroup));
        when(memberMapper.selectList(any()))
                .thenReturn(List.of(buildMember(100L, 1L, 10L), buildMember(101L, 2L, 10L)));
        when(memberMapper.selectCount(any()))
                .thenReturn(0L)
                .thenReturn(4L);
        when(groupMapper.selectById(anyLong())).thenAnswer(invocation -> {
            Long id = invocation.getArgument(0);
            if (id.equals(1L)) {
                return removedGroup;
            }
            if (id.equals(3L)) {
                return addedGroup;
            }
            return keptGroup;
        });

        service.syncDeviceGroups(10L, List.of(2L, 3L));

        verify(memberMapper).delete(any());
        ArgumentCaptor<DeviceGroupMember> memberCaptor = ArgumentCaptor.forClass(DeviceGroupMember.class);
        verify(memberMapper).insert(memberCaptor.capture());
        assertEquals(3L, memberCaptor.getValue().getGroupId());
        assertEquals(10L, memberCaptor.getValue().getDeviceId());

        ArgumentCaptor<DeviceGroup> groupCaptor = ArgumentCaptor.forClass(DeviceGroup.class);
        verify(groupMapper, times(2)).updateById(groupCaptor.capture());
        List<DeviceGroup> updatedGroups = groupCaptor.getAllValues();
        assertEquals(1L, updatedGroups.get(0).getId());
        assertEquals(0, updatedGroups.get(0).getDeviceCount());
        assertEquals(3L, updatedGroups.get(1).getId());
        assertEquals(4, updatedGroups.get(1).getDeviceCount());
    }

    @Test
    void rebuildDynamicGroupsForDeviceShouldTrackMembershipByRule() {
        AppContextHolder.setTenantId(1L);

        Device device = new Device();
        device.setId(10L);
        device.setTenantId(1L);
        device.setProductId(100L);
        device.setDeviceName("gateway-01");
        device.setNickname("North Gateway");
        device.setStatus(DeviceStatus.ACTIVE);
        device.setOnlineStatus(OnlineStatus.ONLINE);
        device.setTags("[\"region:north\",\"site:factory-a\"]");

        DeviceGroup dynamicGroup = buildGroup(5L, "north-online", "DYNAMIC");
        dynamicGroup.setDynamicRule("""
                {"matchMode":"ALL","conditions":[
                  {"field":"productKey","operator":"IN","values":["pk_gateway"]},
                  {"field":"onlineStatus","operator":"EQ","value":"ONLINE"},
                  {"field":"tag","operator":"HAS_TAG","tagKey":"region","tagValue":"north"}
                ]}
                """);

        Product product = new Product();
        product.setId(100L);
        product.setProductKey("pk_gateway");

        when(deviceMapper.selectByIdIgnoreTenant(10L)).thenReturn(device);
        when(groupMapper.selectList(any())).thenReturn(List.of(dynamicGroup));
        when(productMapper.selectBatchIds(List.of(100L))).thenReturn(List.of(product));
        when(memberMapper.selectList(any())).thenReturn(List.of());
        when(memberMapper.selectCount(any())).thenReturn(1L);
        when(groupMapper.selectById(5L)).thenReturn(dynamicGroup);

        service.rebuildDynamicGroupsForDevice(10L);

        ArgumentCaptor<DeviceGroupMember> memberCaptor = ArgumentCaptor.forClass(DeviceGroupMember.class);
        verify(memberMapper).insert(memberCaptor.capture());
        assertEquals(5L, memberCaptor.getValue().getGroupId());
        assertEquals(10L, memberCaptor.getValue().getDeviceId());
        verify(groupMapper).updateById(any(DeviceGroup.class));
    }

    @Test
    void deleteGroupShouldDeleteChildrenAndMembersTogether() {
        AppContextHolder.setTenantId(1L);

        DeviceGroup root = buildGroup(1L, "root", "STATIC");
        DeviceGroup child = buildGroup(2L, "child", "DYNAMIC");
        child.setParentId(1L);
        DeviceGroup grandChild = buildGroup(3L, "grand-child", "STATIC");
        grandChild.setParentId(2L);

        when(groupMapper.selectById(1L)).thenReturn(root);
        when(groupMapper.selectById(2L)).thenReturn(child);
        when(groupMapper.selectById(3L)).thenReturn(grandChild);
        when(groupMapper.selectList(any()))
                .thenReturn(List.of(child))
                .thenReturn(List.of(grandChild))
                .thenReturn(List.of());

        service.deleteGroup(1L);

        verify(memberMapper).delete(any());
        ArgumentCaptor<List<Long>> groupIdsCaptor = ArgumentCaptor.forClass(List.class);
        verify(groupMapper).deleteBatchIds(groupIdsCaptor.capture());
        assertEquals(List.of(3L, 2L, 1L), groupIdsCaptor.getValue());
    }

    private DeviceGroup buildGroup(Long id, String name, String type) {
        DeviceGroup group = new DeviceGroup();
        group.setId(id);
        group.setTenantId(1L);
        group.setName(name);
        group.setType(type);
        group.setDeviceCount(0);
        return group;
    }

    private DeviceGroupMember buildMember(Long id, Long groupId, Long deviceId) {
        DeviceGroupMember member = new DeviceGroupMember();
        member.setId(id);
        member.setGroupId(groupId);
        member.setDeviceId(deviceId);
        member.setCreatedAt(LocalDateTime.now());
        return member;
    }
}
