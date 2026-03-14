package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.entity.DeviceGroupMember;
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
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceGroupServiceTest {

    private final DeviceGroupMapper groupMapper = org.mockito.Mockito.mock(DeviceGroupMapper.class);
    private final DeviceGroupMemberMapper memberMapper = org.mockito.Mockito.mock(DeviceGroupMemberMapper.class);
    private final DeviceMapper deviceMapper = org.mockito.Mockito.mock(DeviceMapper.class);
    private final ProductMapper productMapper = org.mockito.Mockito.mock(ProductMapper.class);
    private final DeviceGroupService service = new DeviceGroupService(groupMapper, memberMapper, deviceMapper, productMapper);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void syncDeviceGroupsShouldReplaceMembershipsAndRefreshCounts() {
        AppContextHolder.setTenantId(1L);

        Device device = new Device();
        device.setId(10L);
        device.setTenantId(1L);

        DeviceGroup removedGroup = buildGroup(1L, "old-group");
        DeviceGroup keptGroup = buildGroup(2L, "kept-group");
        DeviceGroup addedGroup = buildGroup(3L, "new-group");

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

        verify(memberMapper, times(1)).delete(any());
        ArgumentCaptor<DeviceGroupMember> memberCaptor = ArgumentCaptor.forClass(DeviceGroupMember.class);
        verify(memberMapper, times(1)).insert(memberCaptor.capture());
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
    void deleteGroupShouldDeleteChildrenAndMembersTogether() {
        AppContextHolder.setTenantId(1L);

        DeviceGroup root = buildGroup(1L, "root");
        DeviceGroup child = buildGroup(2L, "child");
        child.setParentId(1L);
        DeviceGroup grandChild = buildGroup(3L, "grand-child");
        grandChild.setParentId(2L);

        when(groupMapper.selectById(1L)).thenReturn(root);
        when(groupMapper.selectById(2L)).thenReturn(child);
        when(groupMapper.selectById(3L)).thenReturn(grandChild);
        when(groupMapper.selectList(any()))
                .thenReturn(List.of(child))
                .thenReturn(List.of(grandChild))
                .thenReturn(List.of());

        service.deleteGroup(1L);

        verify(memberMapper, times(1)).delete(any());
        ArgumentCaptor<List<Long>> groupIdsCaptor = ArgumentCaptor.forClass(List.class);
        verify(groupMapper).deleteBatchIds(groupIdsCaptor.capture());
        assertEquals(List.of(3L, 2L, 1L), groupIdsCaptor.getValue());
    }

    private DeviceGroup buildGroup(Long id, String name) {
        DeviceGroup group = new DeviceGroup();
        group.setId(id);
        group.setTenantId(1L);
        group.setName(name);
        group.setType("STATIC");
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
