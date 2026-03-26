package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.InternalDeviceCreateDTO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.DeviceConvert;
import com.songhg.firefly.iot.device.convert.DeviceGroupConvert;
import com.songhg.firefly.iot.device.convert.DeviceTagConvert;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateItemDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceCredentialVO;
import com.songhg.firefly.iot.device.dto.device.DeviceQueryDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyNodeVO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyOverviewVO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyQueryDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceTopologyVO;
import com.songhg.firefly.iot.device.dto.device.DeviceTripleExportDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceUpdateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceVO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupVO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceVideoChannelMapper;
import com.songhg.firefly.iot.device.mapper.DeviceVideoProfileMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.service.DeviceLocatorService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.function.Predicate;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceService {

    private static final String CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int MAX_TOPOLOGY_DEVICE_COUNT = 3000;
    private static final SecureRandom RANDOM = new SecureRandom();

    private final DeviceMapper deviceMapper;
    private final ProductMapper productMapper;
    private final DeviceLocatorService deviceLocatorService;
    private final DeviceTagService deviceTagService;
    private final DeviceGroupService deviceGroupService;
    private final DeviceVideoProfileMapper deviceVideoProfileMapper;
    private final DeviceVideoChannelMapper deviceVideoChannelMapper;

    @Transactional
    public DeviceCredentialVO createDevice(DeviceCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Product product = getProductOrThrow(dto.getProductId());
        validateManualRegistrationAllowed(product);
        validateUniqueDeviceNames(dto.getProductId(), List.of(dto.getDeviceName()));

        Device device = buildDevice(
                tenantId,
                userId,
                dto.getProductId(),
                dto.getProjectId(),
                dto.getDeviceName(),
                dto.getNickname(),
                dto.getDescription()
        );
        deviceMapper.insert(device);
        deviceTagService.syncDeviceTags(device.getId(), dto.getTagIds());
        deviceGroupService.syncDeviceGroups(device.getId(), dto.getGroupIds());
        bindDeviceLocators(device.getId(), dto.getLocators());
        deviceGroupService.rebuildDynamicGroupsForDevice(device.getId());
        increaseProductDeviceCount(product, 1);

        log.info("Device created: id={}, deviceName={}, productId={}", device.getId(), device.getDeviceName(), dto.getProductId());
        return toCredentialVO(device, product);
    }

    @Transactional
    public DeviceBasicVO createDeviceFromInternal(InternalDeviceCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Product product = getProductOrThrow(dto.getProductId());
        validateManualRegistrationAllowed(product);
        validateUniqueDeviceNames(dto.getProductId(), List.of(dto.getDeviceName()));

        Device device = buildDevice(
                tenantId,
                userId,
                dto.getProductId(),
                dto.getProjectId(),
                dto.getDeviceName(),
                dto.getNickname(),
                dto.getDescription()
        );
        deviceMapper.insert(device);
        // 视频等跨服务建链场景会把当前可见范围内的静态分组一并带过来，
        // 同时对动态分组做一次重算，避免设备创建成功后立刻落到当前数据权限之外。
        List<Long> staticGroupIds = deviceGroupService.filterStaticGroupIds(dto.getGroupIds());
        deviceGroupService.syncDeviceGroups(device.getId(), staticGroupIds);
        deviceGroupService.rebuildDynamicGroupsForDevice(device.getId());
        increaseProductDeviceCount(product, 1);

        log.info("Internal device created: id={}, deviceName={}, productId={}", device.getId(), device.getDeviceName(), dto.getProductId());
        return deviceMapper.selectBasicByIdIgnoreTenant(device.getId());
    }

    @Transactional
    public List<DeviceCredentialVO> batchCreateDevices(DeviceBatchCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Product product = getProductOrThrow(dto.getProductId());
        validateManualRegistrationAllowed(product);

        List<DeviceBatchCreateItemDTO> items = dto.getDevices() == null ? Collections.emptyList() : dto.getDevices();
        if (items.isEmpty()) {
            throw new BizException(ResultCode.BAD_REQUEST, "Device list cannot be empty");
        }

        List<String> deviceNames = items.stream()
                .map(DeviceBatchCreateItemDTO::getDeviceName)
                .filter(Objects::nonNull)
                .toList();
        validateUniqueDeviceNames(dto.getProductId(), deviceNames);

        List<DeviceCredentialVO> result = new ArrayList<>(items.size());
        for (DeviceBatchCreateItemDTO item : items) {
            Device device = buildDevice(
                    tenantId,
                    userId,
                    dto.getProductId(),
                    dto.getProjectId(),
                    item.getDeviceName(),
                    item.getNickname(),
                    dto.getDescription()
            );
            deviceMapper.insert(device);
            deviceTagService.syncDeviceTags(device.getId(), dto.getTagIds());
            deviceGroupService.syncDeviceGroups(device.getId(), dto.getGroupIds());
            bindDeviceLocators(device.getId(), item.getLocators());
            deviceGroupService.rebuildDynamicGroupsForDevice(device.getId());
            result.add(toCredentialVO(device, product));
        }

        increaseProductDeviceCount(product, items.size());
        log.info("Devices batch created: count={}, productId={}", items.size(), dto.getProductId());
        return result;
    }

    public DeviceVO getDeviceById(Long id) {
        Device device = getActiveDevice(id);
        DeviceVO vo = DeviceConvert.INSTANCE.toVO(device);
        attachDeviceTags(List.of(vo));
        attachDeviceGroups(List.of(vo));
        return vo;
    }

    @DataScope(projectColumn = "project_id", productColumn = "", deviceColumn = "id", groupColumn = "")
    public IPage<DeviceVO> listDevices(DeviceQueryDTO query) {
        Page<Device> page = new Page<>(query.getPageNum(), query.getPageSize());
        IPage<Device> result = deviceMapper.selectPage(page, buildListWrapper(query));
        IPage<DeviceVO> voPage = result.convert(DeviceConvert.INSTANCE::toVO);
        attachDeviceTags(voPage.getRecords());
        attachDeviceGroups(voPage.getRecords());
        return voPage;
    }

    @DataScope(projectColumn = "project_id", productColumn = "", deviceColumn = "id", groupColumn = "")
    public DeviceTopologyVO getDeviceTopology(DeviceTopologyQueryDTO query) {
        DeviceTopologyQueryDTO topologyQuery = query == null ? new DeviceTopologyQueryDTO() : query;
        List<Device> matchedDevices = deviceMapper.selectList(buildTopologySeedWrapper(topologyQuery));
        Map<Long, Device> topologyDeviceMap = collectTopologyScopeDevices(topologyQuery, matchedDevices);

        List<DeviceTopologyNodeVO> rootNodes = List.of();
        List<DeviceTopologyNodeVO> standaloneDevices = List.of();
        List<DeviceTopologyNodeVO> orphanDevices = List.of();
        DeviceTopologyOverviewVO overview = new DeviceTopologyOverviewVO();
        overview.setMatchedDevices(matchedDevices.size());
        overview.setVisibleDevices(0);
        overview.setRootNodes(0);
        overview.setGatewayDevices(0);
        overview.setSubDevices(0);
        overview.setStandaloneDevices(0);
        overview.setOrphanDevices(0);
        overview.setOnlineDevices(0);
        overview.setMaxDepth(0);

        if (!topologyDeviceMap.isEmpty()) {
            Map<Long, Product> productMap = loadProductMap(topologyDeviceMap.values());
            Map<Long, DeviceTopologyNodeVO> nodeMap = buildTopologyNodeMap(topologyDeviceMap.values(), productMap);
            Map<Long, List<Long>> childIdMap = buildTopologyChildMap(nodeMap);
            fillTopologyNodeMeta(nodeMap, childIdMap);

            Set<Long> matchedIds = matchedDevices.stream()
                    .map(Device::getId)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toCollection(LinkedHashSet::new));

            rootNodes = buildTopologyCategory(
                    nodeMap,
                    childIdMap,
                    matchedIds,
                    node -> node.getGatewayId() == null && node.getDirectChildCount() != null && node.getDirectChildCount() > 0
            );
            standaloneDevices = buildTopologyCategory(
                    nodeMap,
                    childIdMap,
                    matchedIds,
                    node -> node.getGatewayId() == null
                            && (node.getDirectChildCount() == null || node.getDirectChildCount() == 0)
            );
            orphanDevices = buildTopologyCategory(
                    nodeMap,
                    childIdMap,
                    matchedIds,
                    DeviceTopologyNodeVO::isOrphan
            );
            overview = buildTopologyOverview(nodeMap.values(), matchedIds, rootNodes, standaloneDevices, orphanDevices);
        }

        DeviceTopologyVO topology = new DeviceTopologyVO();
        topology.setOverview(overview);
        topology.setRootNodes(rootNodes);
        topology.setStandaloneDevices(standaloneDevices);
        topology.setOrphanDevices(orphanDevices);
        return topology;
    }

    @DataScope(projectColumn = "project_id", productColumn = "", deviceColumn = "id", groupColumn = "")
    public List<DeviceCredentialVO> exportDeviceTriples(DeviceTripleExportDTO dto) {
        DeviceTripleExportDTO exportQuery = dto == null ? new DeviceTripleExportDTO() : dto;
        LambdaQueryWrapper<Device> wrapper = buildExportWrapper(exportQuery);
        List<Device> devices = deviceMapper.selectList(wrapper);
        if (devices.isEmpty()) {
            return Collections.emptyList();
        }

        Map<Long, Product> productMap = productMapper.selectBatchIds(
                        devices.stream().map(Device::getProductId).filter(Objects::nonNull).distinct().toList()
                ).stream()
                .collect(Collectors.toMap(Product::getId, item -> item));

        return devices.stream()
                .map(device -> toCredentialVO(device, productMap.get(device.getProductId())))
                .toList();
    }

    @Transactional
    public DeviceVO updateDevice(Long id, DeviceUpdateDTO dto) {
        Device device = getActiveDevice(id);
        DeviceConvert.INSTANCE.updateEntity(dto, device);
        deviceMapper.updateById(device);
        deviceTagService.syncDeviceTags(device.getId(), dto.getTagIds());
        deviceGroupService.syncDeviceGroups(device.getId(), dto.getGroupIds());

        DeviceVO vo = DeviceConvert.INSTANCE.toVO(device);
        attachDeviceTags(List.of(vo));
        attachDeviceGroups(List.of(vo));
        return vo;
    }

    @Transactional
    public void enableDevice(Long id) {
        Device device = getActiveDevice(id);
        if (device.getStatus() != DeviceStatus.DISABLED) {
            throw new BizException(ResultCode.DEVICE_STATUS_ERROR);
        }
        device.setStatus(DeviceStatus.ACTIVE);
        deviceMapper.updateById(device);
        deviceGroupService.rebuildDynamicGroupsForDevice(device.getId());
        log.info("Device enabled: id={}, deviceName={}", id, device.getDeviceName());
    }

    @Transactional
    public void disableDevice(Long id) {
        Device device = getActiveDevice(id);
        if (device.getStatus() == DeviceStatus.DISABLED) {
            throw new BizException(ResultCode.DEVICE_STATUS_ERROR);
        }
        device.setStatus(DeviceStatus.DISABLED);
        device.setOnlineStatus(OnlineStatus.OFFLINE);
        deviceMapper.updateById(device);
        deviceGroupService.rebuildDynamicGroupsForDevice(device.getId());
        log.info("Device disabled: id={}, deviceName={}", id, device.getDeviceName());
    }

    @Transactional
    public void deleteDevice(Long id) {
        Device device = getActiveDevice(id);
        deviceLocatorService.deleteByDeviceId(device.getId());
        deviceTagService.removeDeviceBindings(device.getId());
        deviceGroupService.removeDeviceMemberships(device.getId());
        deviceVideoChannelMapper.delete(new LambdaQueryWrapper<com.songhg.firefly.iot.device.entity.DeviceVideoChannel>()
                .eq(com.songhg.firefly.iot.device.entity.DeviceVideoChannel::getDeviceId, device.getId()));
        deviceVideoProfileMapper.deleteById(device.getId());
        device.setOnlineStatus(OnlineStatus.OFFLINE);

        // Device uses MyBatis-Plus logical delete on deletedAt.
        // Deleting through deleteById keeps logical-delete SQL and query filtering consistent.
        deviceMapper.updateById(device);
        deviceMapper.deleteById(device.getId());

        Product product = productMapper.selectById(device.getProductId());
        if (product != null && product.getDeviceCount() != null && product.getDeviceCount() > 0) {
            product.setDeviceCount(product.getDeviceCount() - 1);
            productMapper.updateById(product);
        }

        log.info("Device deleted: id={}, deviceName={}", id, device.getDeviceName());
    }

    public String getDeviceSecret(Long id) {
        Device device = getActiveDevice(id);
        return device.getDeviceSecret();
    }

    public DeviceBasicVO getDeviceBasic(Long id) {
        return deviceMapper.selectBasicByIdIgnoreTenant(id);
    }

    public List<DeviceBasicVO> batchGetDeviceBasic(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return List.of();
        }
        return deviceMapper.selectBasicByIdsIgnoreTenant(ids);
    }

    public Long countByProductId(Long productId) {
        if (productId == null) {
            return 0L;
        }
        Long count = deviceMapper.countByProductIdIgnoreTenant(productId);
        return count == null ? 0L : count;
    }

    @Transactional
    public void updateRuntimeConnectionState(Long tenantId, Long deviceId, OnlineStatus onlineStatus, LocalDateTime occurredAt) {
        if (deviceId == null || onlineStatus == null) {
            return;
        }

        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            log.warn("Skip runtime connection update because device does not exist: deviceId={}", deviceId);
            return;
        }
        if (tenantId != null && device.getTenantId() != null && !tenantId.equals(device.getTenantId())) {
            log.warn("Skip runtime connection update because tenant mismatch: deviceId={}, tenantId={}, actualTenantId={}",
                    deviceId, tenantId, device.getTenantId());
            return;
        }

        LocalDateTime changedAt = occurredAt != null ? occurredAt : LocalDateTime.now();
        device.setOnlineStatus(onlineStatus);
        if (onlineStatus == OnlineStatus.ONLINE) {
            device.setLastOnlineAt(changedAt);
            // A device becomes "activated" after the first successful online event,
            // regardless of whether it was pre-created or dynamically registered.
            if (device.getStatus() == DeviceStatus.INACTIVE) {
                device.setStatus(DeviceStatus.ACTIVE);
                if (device.getActivatedAt() == null) {
                    device.setActivatedAt(changedAt);
                }
            }
        } else if (onlineStatus == OnlineStatus.OFFLINE) {
            device.setLastOfflineAt(changedAt);
        }
        deviceMapper.updateById(device);
        deviceGroupService.rebuildDynamicGroupsForDevice(device.getId());
    }

    private Map<Long, Device> collectTopologyScopeDevices(DeviceTopologyQueryDTO query, List<Device> matchedDevices) {
        Map<Long, Device> scopeDeviceMap = matchedDevices.stream()
                .filter(device -> device.getId() != null)
                .collect(Collectors.toMap(
                        Device::getId,
                        device -> device,
                        (left, right) -> left,
                        java.util.LinkedHashMap::new
                ));
        ensureTopologyDeviceLimit(scopeDeviceMap.size());

        if (scopeDeviceMap.isEmpty() || !hasTopologyFilters(query)) {
            return scopeDeviceMap;
        }

        // 拓扑筛选不能直接把上下游链路裁断，所以命中节点会继续补齐祖先和后代节点。
        Set<Long> pendingParentIds = matchedDevices.stream()
                .map(Device::getGatewayId)
                .filter(Objects::nonNull)
                .filter(parentId -> !scopeDeviceMap.containsKey(parentId))
                .collect(Collectors.toCollection(LinkedHashSet::new));

        while (!pendingParentIds.isEmpty()) {
            List<Device> parents = deviceMapper.selectList(buildTopologyAncestorWrapper(pendingParentIds, query.getProjectId()));
            Set<Long> nextParentIds = new LinkedHashSet<>();
            for (Device parent : parents) {
                if (parent.getId() == null) {
                    continue;
                }
                if (scopeDeviceMap.putIfAbsent(parent.getId(), parent) == null && parent.getGatewayId() != null) {
                    nextParentIds.add(parent.getGatewayId());
                }
            }
            ensureTopologyDeviceLimit(scopeDeviceMap.size());
            pendingParentIds = nextParentIds.stream()
                    .filter(parentId -> !scopeDeviceMap.containsKey(parentId))
                    .collect(Collectors.toCollection(LinkedHashSet::new));
        }

        Set<Long> pendingGatewayIds = matchedDevices.stream()
                .map(Device::getId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));

        while (!pendingGatewayIds.isEmpty()) {
            List<Device> children = deviceMapper.selectList(buildTopologyDescendantWrapper(pendingGatewayIds, query.getProjectId()));
            Set<Long> nextGatewayIds = new LinkedHashSet<>();
            for (Device child : children) {
                if (child.getId() == null) {
                    continue;
                }
                if (scopeDeviceMap.putIfAbsent(child.getId(), child) == null) {
                    nextGatewayIds.add(child.getId());
                }
            }
            ensureTopologyDeviceLimit(scopeDeviceMap.size());
            pendingGatewayIds = nextGatewayIds;
        }

        return scopeDeviceMap;
    }

    private Map<Long, Product> loadProductMap(Collection<Device> devices) {
        List<Long> productIds = devices.stream()
                .map(Device::getProductId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (productIds.isEmpty()) {
            return Map.of();
        }
        return productMapper.selectBatchIds(productIds).stream()
                .filter(Objects::nonNull)
                .collect(Collectors.toMap(Product::getId, product -> product));
    }

    private Map<Long, DeviceTopologyNodeVO> buildTopologyNodeMap(Collection<Device> devices, Map<Long, Product> productMap) {
        Map<Long, DeviceTopologyNodeVO> nodeMap = new HashMap<>();
        for (Device device : devices) {
            if (device.getId() == null) {
                continue;
            }
            Product product = productMap.get(device.getProductId());
            DeviceTopologyNodeVO node = new DeviceTopologyNodeVO();
            node.setId(device.getId());
            node.setProductId(device.getProductId());
            node.setDeviceName(device.getDeviceName());
            node.setNickname(device.getNickname());
            node.setProductName(product != null ? product.getName() : null);
            node.setProductKey(product != null ? product.getProductKey() : null);
            node.setNodeType(product != null && product.getNodeType() != null ? product.getNodeType() : NodeType.DEVICE);
            node.setStatus(device.getStatus());
            node.setOnlineStatus(device.getOnlineStatus());
            node.setFirmwareVersion(device.getFirmwareVersion());
            node.setIpAddress(device.getIpAddress());
            node.setGatewayId(device.getGatewayId());
            node.setLastOnlineAt(device.getLastOnlineAt());
            node.setCreatedAt(device.getCreatedAt());
            node.setChildren(List.of());
            nodeMap.put(node.getId(), node);
        }
        return nodeMap;
    }

    private Map<Long, List<Long>> buildTopologyChildMap(Map<Long, DeviceTopologyNodeVO> nodeMap) {
        Map<Long, List<Long>> childIdMap = new HashMap<>();
        for (DeviceTopologyNodeVO node : nodeMap.values()) {
            if (node.getId() == null || node.getGatewayId() == null || Objects.equals(node.getId(), node.getGatewayId())) {
                continue;
            }
            if (!nodeMap.containsKey(node.getGatewayId())) {
                continue;
            }
            childIdMap.computeIfAbsent(node.getGatewayId(), ignored -> new ArrayList<>()).add(node.getId());
        }
        childIdMap.values().forEach(childIds -> childIds.sort((leftId, rightId) ->
                compareTopologyNode(nodeMap.get(leftId), nodeMap.get(rightId))));
        return childIdMap;
    }

    private void fillTopologyNodeMeta(Map<Long, DeviceTopologyNodeVO> nodeMap, Map<Long, List<Long>> childIdMap) {
        Map<Long, Integer> descendantCache = new HashMap<>();
        for (DeviceTopologyNodeVO node : nodeMap.values()) {
            DeviceTopologyNodeVO parent = node.getGatewayId() == null ? null : nodeMap.get(node.getGatewayId());
            node.setGatewayDeviceName(parent != null ? parent.getDeviceName() : null);
            node.setDirectChildCount(childIdMap.getOrDefault(node.getId(), List.of()).size());
            node.setDescendantCount(countTopologyDescendants(node.getId(), childIdMap, descendantCache, new HashSet<>()));
            node.setOrphan(node.getGatewayId() != null && parent == null);
        }
    }

    private int countTopologyDescendants(
            Long nodeId,
            Map<Long, List<Long>> childIdMap,
            Map<Long, Integer> descendantCache,
            Set<Long> path
    ) {
        if (nodeId == null) {
            return 0;
        }
        Integer cached = descendantCache.get(nodeId);
        if (cached != null) {
            return cached;
        }
        if (!path.add(nodeId)) {
            log.warn("Skip topology descendant recursion because a cycle was detected: nodeId={}", nodeId);
            return 0;
        }
        int total = 0;
        for (Long childId : childIdMap.getOrDefault(nodeId, List.of())) {
            total += 1 + countTopologyDescendants(childId, childIdMap, descendantCache, path);
        }
        path.remove(nodeId);
        descendantCache.put(nodeId, total);
        return total;
    }

    private List<DeviceTopologyNodeVO> buildTopologyCategory(
            Map<Long, DeviceTopologyNodeVO> nodeMap,
            Map<Long, List<Long>> childIdMap,
            Set<Long> matchedIds,
            Predicate<DeviceTopologyNodeVO> rootPredicate
    ) {
        return nodeMap.values().stream()
                .filter(rootPredicate)
                .map(node -> cloneVisibleTopologyNode(node.getId(), nodeMap, childIdMap, matchedIds, false, new HashSet<>()))
                .filter(Objects::nonNull)
                .sorted(this::compareTopologyNode)
                .toList();
    }

    private DeviceTopologyNodeVO cloneVisibleTopologyNode(
            Long nodeId,
            Map<Long, DeviceTopologyNodeVO> nodeMap,
            Map<Long, List<Long>> childIdMap,
            Set<Long> matchedIds,
            boolean forceInclude,
            Set<Long> path
    ) {
        if (nodeId == null) {
            return null;
        }
        DeviceTopologyNodeVO source = nodeMap.get(nodeId);
        if (source == null) {
            return null;
        }
        if (!path.add(nodeId)) {
            log.warn("Skip topology tree recursion because a cycle was detected: nodeId={}", nodeId);
            return null;
        }

        boolean selfMatched = matchedIds.contains(nodeId);
        boolean includeChildren = forceInclude || selfMatched;
        List<DeviceTopologyNodeVO> visibleChildren = childIdMap.getOrDefault(nodeId, List.of()).stream()
                .map(childId -> cloneVisibleTopologyNode(childId, nodeMap, childIdMap, matchedIds, includeChildren, path))
                .filter(Objects::nonNull)
                .toList();

        path.remove(nodeId);
        if (!selfMatched && !forceInclude && visibleChildren.isEmpty()) {
            return null;
        }

        DeviceTopologyNodeVO target = copyTopologyNode(source);
        target.setMatched(selfMatched);
        target.setChildren(visibleChildren);
        return target;
    }

    private DeviceTopologyNodeVO copyTopologyNode(DeviceTopologyNodeVO source) {
        DeviceTopologyNodeVO copy = new DeviceTopologyNodeVO();
        copy.setId(source.getId());
        copy.setProductId(source.getProductId());
        copy.setDeviceName(source.getDeviceName());
        copy.setNickname(source.getNickname());
        copy.setProductName(source.getProductName());
        copy.setProductKey(source.getProductKey());
        copy.setNodeType(source.getNodeType());
        copy.setStatus(source.getStatus());
        copy.setOnlineStatus(source.getOnlineStatus());
        copy.setFirmwareVersion(source.getFirmwareVersion());
        copy.setIpAddress(source.getIpAddress());
        copy.setGatewayId(source.getGatewayId());
        copy.setGatewayDeviceName(source.getGatewayDeviceName());
        copy.setDirectChildCount(source.getDirectChildCount());
        copy.setDescendantCount(source.getDescendantCount());
        copy.setOrphan(source.isOrphan());
        copy.setLastOnlineAt(source.getLastOnlineAt());
        copy.setCreatedAt(source.getCreatedAt());
        copy.setChildren(List.of());
        return copy;
    }

    private DeviceTopologyOverviewVO buildTopologyOverview(
            Collection<DeviceTopologyNodeVO> allNodes,
            Set<Long> matchedIds,
            List<DeviceTopologyNodeVO> rootNodes,
            List<DeviceTopologyNodeVO> standaloneDevices,
            List<DeviceTopologyNodeVO> orphanDevices
    ) {
        Set<Long> visibleIds = new LinkedHashSet<>();
        collectVisibleTopologyIds(rootNodes, visibleIds);
        collectVisibleTopologyIds(standaloneDevices, visibleIds);
        collectVisibleTopologyIds(orphanDevices, visibleIds);

        DeviceTopologyOverviewVO overview = new DeviceTopologyOverviewVO();
        overview.setMatchedDevices(matchedIds.size());
        overview.setVisibleDevices(visibleIds.size());
        overview.setRootNodes(rootNodes.size());
        overview.setGatewayDevices((int) allNodes.stream()
                .filter(node -> visibleIds.contains(node.getId()))
                .filter(node -> node.getNodeType() == NodeType.GATEWAY)
                .count());
        overview.setSubDevices((int) allNodes.stream()
                .filter(node -> visibleIds.contains(node.getId()))
                .filter(node -> node.getGatewayId() != null)
                .count());
        overview.setStandaloneDevices(standaloneDevices.size());
        overview.setOrphanDevices(orphanDevices.size());
        overview.setOnlineDevices((int) allNodes.stream()
                .filter(node -> visibleIds.contains(node.getId()))
                .filter(node -> node.getOnlineStatus() == OnlineStatus.ONLINE)
                .count());
        overview.setMaxDepth(Math.max(
                countTopologyDepth(rootNodes),
                Math.max(countTopologyDepth(standaloneDevices), countTopologyDepth(orphanDevices))
        ));
        return overview;
    }

    private void collectVisibleTopologyIds(List<DeviceTopologyNodeVO> nodes, Set<Long> collector) {
        for (DeviceTopologyNodeVO node : nodes) {
            if (node.getId() != null) {
                collector.add(node.getId());
            }
            collectVisibleTopologyIds(node.getChildren() == null ? List.of() : node.getChildren(), collector);
        }
    }

    private int countTopologyDepth(List<DeviceTopologyNodeVO> nodes) {
        int maxDepth = 0;
        for (DeviceTopologyNodeVO node : nodes) {
            int childDepth = countTopologyDepth(node.getChildren() == null ? List.of() : node.getChildren());
            maxDepth = Math.max(maxDepth, childDepth + 1);
        }
        return maxDepth;
    }

    private int compareTopologyNode(DeviceTopologyNodeVO left, DeviceTopologyNodeVO right) {
        if (left == null && right == null) {
            return 0;
        }
        if (left == null) {
            return 1;
        }
        if (right == null) {
            return -1;
        }
        Comparator<DeviceTopologyNodeVO> comparator = Comparator
                .comparing((DeviceTopologyNodeVO node) -> node.getOnlineStatus() == OnlineStatus.ONLINE ? 0 : 1)
                .thenComparing(node -> node.getNodeType() == NodeType.GATEWAY ? 0 : 1)
                .thenComparing(DeviceService::getTopologyDisplayName, String.CASE_INSENSITIVE_ORDER)
                .thenComparing(node -> node.getProductName() == null ? "" : node.getProductName(), String.CASE_INSENSITIVE_ORDER);
        return comparator.compare(left, right);
    }

    private static String getTopologyDisplayName(DeviceTopologyNodeVO node) {
        if (node == null) {
            return "";
        }
        if (node.getNickname() != null && !node.getNickname().isBlank()) {
            return node.getNickname();
        }
        return node.getDeviceName() == null ? "" : node.getDeviceName();
    }

    private LambdaQueryWrapper<Device> buildTopologySeedWrapper(DeviceTopologyQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Device::getTenantId, tenantId);
        wrapper.isNull(Device::getDeletedAt);
        if (query.getProjectId() != null) {
            wrapper.eq(Device::getProjectId, query.getProjectId());
        }
        if (query.getProductId() != null) {
            wrapper.eq(Device::getProductId, query.getProductId());
        }
        if (query.getGroupId() != null) {
            List<Long> deviceIds = deviceGroupService.listDeviceIdsByGroup(query.getGroupId());
            if (deviceIds.isEmpty()) {
                wrapper.isNull(Device::getId);
            } else {
                wrapper.in(Device::getId, deviceIds);
            }
        }
        if (query.getStatus() != null) {
            wrapper.eq(Device::getStatus, query.getStatus());
        }
        if (query.getOnlineStatus() != null) {
            wrapper.eq(Device::getOnlineStatus, query.getOnlineStatus());
        }
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            String keyword = query.getKeyword().trim();
            List<Long> matchedProductIds = productMapper.selectList(new LambdaQueryWrapper<Product>()
                            .eq(Product::getTenantId, tenantId)
                            .and(condition -> condition.like(Product::getName, keyword).or().like(Product::getProductKey, keyword)))
                    .stream()
                    .map(Product::getId)
                    .filter(Objects::nonNull)
                    .toList();
            wrapper.and(condition -> {
                condition.like(Device::getDeviceName, keyword).or().like(Device::getNickname, keyword);
                if (!matchedProductIds.isEmpty()) {
                    condition.or().in(Device::getProductId, matchedProductIds);
                }
            });
        }
        wrapper.orderByAsc(Device::getGatewayId).orderByAsc(Device::getDeviceName).orderByAsc(Device::getId);
        return wrapper;
    }

    private LambdaQueryWrapper<Device> buildTopologyAncestorWrapper(Collection<Long> deviceIds, Long projectId) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Device::getTenantId, tenantId);
        wrapper.isNull(Device::getDeletedAt);
        wrapper.in(Device::getId, deviceIds);
        if (projectId != null) {
            wrapper.eq(Device::getProjectId, projectId);
        }
        wrapper.orderByAsc(Device::getGatewayId).orderByAsc(Device::getDeviceName).orderByAsc(Device::getId);
        return wrapper;
    }

    private LambdaQueryWrapper<Device> buildTopologyDescendantWrapper(Collection<Long> gatewayIds, Long projectId) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Device::getTenantId, tenantId);
        wrapper.isNull(Device::getDeletedAt);
        wrapper.in(Device::getGatewayId, gatewayIds);
        if (projectId != null) {
            wrapper.eq(Device::getProjectId, projectId);
        }
        wrapper.orderByAsc(Device::getGatewayId).orderByAsc(Device::getDeviceName).orderByAsc(Device::getId);
        return wrapper;
    }

    private boolean hasTopologyFilters(DeviceTopologyQueryDTO query) {
        return query.getProjectId() != null
                || query.getProductId() != null
                || query.getGroupId() != null
                || query.getStatus() != null
                || query.getOnlineStatus() != null
                || (query.getKeyword() != null && !query.getKeyword().isBlank());
    }

    private void ensureTopologyDeviceLimit(int deviceCount) {
        if (deviceCount > MAX_TOPOLOGY_DEVICE_COUNT) {
            throw new BizException(ResultCode.BAD_REQUEST, "当前拓扑范围内设备数超过 3000，请先按产品、分组或项目缩小范围");
        }
    }

    private Product getProductOrThrow(Long productId) {
        Product product = productMapper.selectById(productId);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return product;
    }

    private void validateManualRegistrationAllowed(Product product) {
        if (product.getDeviceAuthType() == DeviceAuthType.PRODUCT_SECRET) {
            throw new BizException(ResultCode.BAD_REQUEST, "Current product uses one-type-one-secret, please register devices through the product onboarding tool");
        }
    }

    private Device buildDevice(
            Long tenantId,
            Long userId,
            Long productId,
            Long projectId,
            String deviceName,
            String nickname,
            String description
    ) {
        Device device = new Device();
        device.setTenantId(tenantId);
        device.setProductId(productId);
        device.setProjectId(projectId);
        device.setDeviceName(trimToNull(deviceName));
        device.setNickname(trimToNull(nickname));
        device.setDescription(trimToNull(description));
        device.setTags("[]");
        device.setDeviceSecret(generateDeviceSecret());
        device.setStatus(DeviceStatus.INACTIVE);
        device.setOnlineStatus(OnlineStatus.UNKNOWN);
        device.setCreatedBy(userId);
        return device;
    }

    private void validateUniqueDeviceNames(Long productId, Collection<String> rawDeviceNames) {
        List<String> deviceNames = rawDeviceNames == null
                ? Collections.emptyList()
                : rawDeviceNames.stream()
                .filter(Objects::nonNull)
                .map(String::trim)
                .filter(item -> !item.isEmpty())
                .toList();
        if (deviceNames.isEmpty()) {
            throw new BizException(ResultCode.BAD_REQUEST, "Device name cannot be empty");
        }

        Set<String> requestDuplicates = collectDuplicateValues(deviceNames);
        if (!requestDuplicates.isEmpty()) {
            throw new BizException(ResultCode.DEVICE_NAME_EXISTS, "Duplicate device names in request: " + String.join(", ", requestDuplicates));
        }

        List<Device> existingDevices = deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                .eq(Device::getProductId, productId)
                .in(Device::getDeviceName, deviceNames)
                .isNull(Device::getDeletedAt));
        if (!existingDevices.isEmpty()) {
            Set<String> existingNames = existingDevices.stream()
                    .map(Device::getDeviceName)
                    .filter(Objects::nonNull)
                    .collect(Collectors.toCollection(LinkedHashSet::new));
            throw new BizException(ResultCode.DEVICE_NAME_EXISTS, "Device name already exists: " + String.join(", ", existingNames));
        }
    }

    private Set<String> collectDuplicateValues(Collection<String> values) {
        Set<String> seen = new LinkedHashSet<>();
        Set<String> duplicates = new LinkedHashSet<>();
        for (String value : values) {
            if (!seen.add(value)) {
                duplicates.add(value);
            }
        }
        return duplicates;
    }

    private void increaseProductDeviceCount(Product product, int increment) {
        int currentCount = product.getDeviceCount() == null ? 0 : product.getDeviceCount();
        product.setDeviceCount(currentCount + increment);
        productMapper.updateById(product);
    }

    private void bindDeviceLocators(Long deviceId, Collection<DeviceLocatorInputDTO> locators) {
        if (deviceId == null || locators == null || locators.isEmpty()) {
            return;
        }
        deviceLocatorService.createBatch(deviceId, locators);
    }

    private LambdaQueryWrapper<Device> buildListWrapper(DeviceQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Device::getTenantId, tenantId);
        wrapper.isNull(Device::getDeletedAt);
        if (Boolean.TRUE.equals(query.getExcludeVideo())) {
            List<Long> videoDeviceIds = deviceVideoProfileMapper.selectList(new LambdaQueryWrapper<com.songhg.firefly.iot.device.entity.DeviceVideoProfile>()
                            .eq(com.songhg.firefly.iot.device.entity.DeviceVideoProfile::getTenantId, tenantId))
                    .stream()
                    .map(com.songhg.firefly.iot.device.entity.DeviceVideoProfile::getDeviceId)
                    .filter(Objects::nonNull)
                    .toList();
            if (!videoDeviceIds.isEmpty()) {
                wrapper.notIn(Device::getId, videoDeviceIds);
            }
        }
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(Device::getDeviceName, query.getKeyword())
                    .or().like(Device::getNickname, query.getKeyword()));
        }
        if (query.getProductId() != null) {
            wrapper.eq(Device::getProductId, query.getProductId());
        }
        if (query.getGroupId() != null) {
            List<Long> deviceIds = deviceGroupService.listDeviceIdsByGroup(query.getGroupId());
            if (deviceIds.isEmpty()) {
                wrapper.isNull(Device::getId);
            } else {
                wrapper.in(Device::getId, deviceIds);
            }
        }
        if (query.getProjectId() != null) {
            wrapper.eq(Device::getProjectId, query.getProjectId());
        }
        if (query.getStatus() != null) {
            wrapper.eq(Device::getStatus, query.getStatus());
        }
        if (query.getOnlineStatus() != null) {
            wrapper.eq(Device::getOnlineStatus, query.getOnlineStatus());
        }
        wrapper.orderByDesc(Device::getCreatedAt);
        return wrapper;
    }

    private LambdaQueryWrapper<Device> buildExportWrapper(DeviceTripleExportDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Device::getTenantId, tenantId);
        wrapper.isNull(Device::getDeletedAt);
        if (query.getDeviceIds() != null && !query.getDeviceIds().isEmpty()) {
            wrapper.in(Device::getId, query.getDeviceIds());
        } else {
            if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
                wrapper.and(w -> w.like(Device::getDeviceName, query.getKeyword())
                        .or().like(Device::getNickname, query.getKeyword()));
            }
            if (query.getProductId() != null) {
                wrapper.eq(Device::getProductId, query.getProductId());
            }
            if (query.getStatus() != null) {
                wrapper.eq(Device::getStatus, query.getStatus());
            }
            if (query.getOnlineStatus() != null) {
                wrapper.eq(Device::getOnlineStatus, query.getOnlineStatus());
            }
        }
        wrapper.orderByDesc(Device::getCreatedAt);
        return wrapper;
    }

    private DeviceCredentialVO toCredentialVO(Device device, Product product) {
        DeviceCredentialVO vo = new DeviceCredentialVO();
        vo.setId(device.getId());
        vo.setProductId(device.getProductId());
        vo.setProductKey(product != null ? product.getProductKey() : null);
        vo.setProductName(product != null ? product.getName() : null);
        vo.setDeviceName(device.getDeviceName());
        vo.setNickname(device.getNickname());
        vo.setDeviceSecret(device.getDeviceSecret());
        return vo;
    }

    private void attachDeviceTags(List<DeviceVO> devices) {
        if (devices == null || devices.isEmpty()) {
            return;
        }

        Map<Long, List<DeviceTagVO>> deviceTagMap = deviceTagService.getDeviceTagMap(
                        devices.stream().map(DeviceVO::getId).filter(Objects::nonNull).toList()
                ).entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        entry -> entry.getValue().stream().map(DeviceTagConvert.INSTANCE::toVO).toList()
                ));

        devices.forEach(device -> {
            List<DeviceTagVO> tagList = deviceTagMap.getOrDefault(device.getId(), List.of());
            device.setTagList(tagList);
            device.setTags(tagList.isEmpty()
                    ? null
                    : tagList.stream()
                    .map(tag -> tag.getTagKey() + ":" + tag.getTagValue())
                    .collect(Collectors.joining(", ")));
        });
    }

    private void attachDeviceGroups(List<DeviceVO> devices) {
        if (devices == null || devices.isEmpty()) {
            return;
        }

        Map<Long, List<DeviceGroupVO>> deviceGroupMap = deviceGroupService.getDeviceGroupMap(
                        devices.stream().map(DeviceVO::getId).filter(Objects::nonNull).toList()
                ).entrySet().stream()
                .collect(Collectors.toMap(
                        Map.Entry::getKey,
                        entry -> entry.getValue().stream().map(DeviceGroupConvert.INSTANCE::toVO).toList()
                ));

        devices.forEach(device -> device.setGroupList(deviceGroupMap.getOrDefault(device.getId(), List.of())));
    }

    private Device getActiveDevice(Long id) {
        Device device = deviceMapper.selectById(id);
        if (device == null || device.getDeletedAt() != null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String generateDeviceSecret() {
        return "ds_" + randomString(32);
    }

    private String randomString(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }
}
