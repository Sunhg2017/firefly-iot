package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.api.dto.InternalVideoChannelVO;
import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import com.songhg.firefly.iot.common.event.VideoChannelsSyncedEvent;
import com.songhg.firefly.iot.common.event.VideoDeviceInfoSyncedEvent;
import com.songhg.firefly.iot.common.event.VideoDeviceStatusChangedEvent;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.mybatis.DataScopeContext;
import com.songhg.firefly.iot.common.mybatis.DataScopeResolver;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoChannelVO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoCreateDTO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoQueryDTO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoUpdateDTO;
import com.songhg.firefly.iot.device.dto.video.DeviceVideoVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceVideoChannel;
import com.songhg.firefly.iot.device.entity.DeviceVideoProfile;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceVideoChannelMapper;
import com.songhg.firefly.iot.device.mapper.DeviceVideoProfileMapper;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.concurrent.ThreadLocalRandom;
import java.util.function.Function;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceVideoService {

    private static final String CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final DateTimeFormatter LINKED_DEVICE_NAME_TIME_FORMATTER =
            DateTimeFormatter.ofPattern("yyyyMMddHHmmssSSS");

    private final DeviceVideoProfileMapper deviceVideoProfileMapper;
    private final DeviceVideoChannelMapper deviceVideoChannelMapper;
    private final DeviceMapper deviceMapper;
    private final ProductMapper productMapper;
    private final DeviceService deviceService;
    private final DeviceGroupService deviceGroupService;
    private final ObjectProvider<DataScopeResolver> dataScopeResolverProvider;

    @Transactional
    public DeviceVideoVO createVideoDevice(DeviceVideoCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Product product = getProductOrThrow(dto.getProductKey(), tenantId);
        validateProductProtocol(product, dto.getStreamMode());

        DeviceVideoProfile profile = new DeviceVideoProfile();
        fillProfile(profile, dto);
        normalizeProfile(profile);
        profile.setTenantId(tenantId);
        profile.setCreatedBy(AppContextHolder.getUserId());
        alignManagedStatus(profile);
        assertIdentityAvailable(profile, null);

        Device device = buildLinkedDevice(product, dto.getName(), profile);
        deviceMapper.insert(device);
        bindScopedGroups(device.getId());
        increaseProductDeviceCount(product, 1);

        profile.setDeviceId(device.getId());
        persistProfile(profile, true);
        log.info("Video device created in device service: deviceId={}, streamMode={}", device.getId(), profile.getStreamMode());
        return getVideoDevice(device.getId());
    }

    @DataScope(projectColumn = "", productColumn = "", deviceColumn = "device_id", groupColumn = "", createdByColumn = "created_by")
    public IPage<DeviceVideoVO> listVideoDevices(DeviceVideoQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<DeviceVideoProfile> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<DeviceVideoProfile> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceVideoProfile::getTenantId, tenantId);
        if (query.getStreamMode() != null) {
            wrapper.eq(DeviceVideoProfile::getStreamMode, query.getStreamMode());
        }
        if (query.getStatus() != null) {
            wrapper.eq(DeviceVideoProfile::getStatus, query.getStatus());
        }
        String keyword = trimToNull(query.getKeyword());
        if (keyword != null) {
            List<Long> matchedDeviceIds = resolveKeywordMatchedDeviceIds(tenantId, keyword);
            wrapper.and(condition -> {
                condition.like(DeviceVideoProfile::getGbDeviceId, keyword)
                        .or().like(DeviceVideoProfile::getIp, keyword)
                        .or().like(DeviceVideoProfile::getSourceUrl, keyword);
                if (!matchedDeviceIds.isEmpty()) {
                    condition.or().in(DeviceVideoProfile::getDeviceId, matchedDeviceIds);
                }
            });
        }
        wrapper.orderByDesc(DeviceVideoProfile::getCreatedAt);

        IPage<DeviceVideoProfile> pageResult = deviceVideoProfileMapper.selectPage(page, wrapper);
        List<DeviceVideoProfile> profiles = pageResult.getRecords();
        Map<Long, Device> deviceMap = loadDeviceMap(profiles.stream().map(DeviceVideoProfile::getDeviceId).toList(), false);
        Map<Long, Product> productMap = loadProductMap(deviceMap.values());
        return pageResult.convert(profile -> toVideoVO(profile, deviceMap.get(profile.getDeviceId()), productMap));
    }

    public DeviceVideoVO getVideoDevice(Long deviceId) {
        DeviceVideoProfile profile = getProfileOrThrow(deviceId);
        Device device = getDeviceOrThrow(deviceId, false);
        return toVideoVO(profile, device, loadProductMap(List.of(device)));
    }

    @Transactional
    public DeviceVideoVO updateVideoDevice(Long deviceId, DeviceVideoUpdateDTO dto) {
        DeviceVideoProfile profile = getProfileOrThrow(deviceId);
        Device device = getDeviceOrThrow(deviceId, false);

        fillProfile(profile, dto);
        normalizeProfile(profile);
        alignManagedStatus(profile);
        assertIdentityAvailable(profile, deviceId);

        String displayName = trimToNull(dto.getName());
        if (displayName != null) {
            device.setNickname(displayName);
        }
        device.setIpAddress(trimToNull(profile.getIp()));
        applyManagedStatusToDevice(device, profile);
        deviceMapper.updateById(device);
        persistProfile(profile, false);
        return getVideoDevice(deviceId);
    }

    @Transactional
    public void deleteVideoDevice(Long deviceId) {
        getProfileOrThrow(deviceId);
        deviceVideoChannelMapper.delete(new LambdaQueryWrapper<DeviceVideoChannel>()
                .eq(DeviceVideoChannel::getDeviceId, deviceId));
        deviceVideoProfileMapper.deleteById(deviceId);
        deviceService.deleteDevice(deviceId);
        log.info("Video device deleted from device service: deviceId={}", deviceId);
    }

    public List<DeviceVideoChannelVO> listChannels(Long deviceId) {
        ensureVideoDeviceExists(deviceId);
        return deviceVideoChannelMapper.selectList(new LambdaQueryWrapper<DeviceVideoChannel>()
                        .eq(DeviceVideoChannel::getDeviceId, deviceId)
                        .orderByAsc(DeviceVideoChannel::getChannelId))
                .stream()
                .map(this::toChannelVO)
                .toList();
    }

    public InternalVideoDeviceVO getInternalVideoDevice(Long deviceId) {
        DeviceVideoProfile profile = deviceVideoProfileMapper.selectByDeviceIdIgnoreTenant(deviceId);
        if (profile == null) {
            return null;
        }
        Device device = getDeviceOrThrow(deviceId, true);
        if (device == null) {
            return null;
        }
        if (!tenantVisible(profile.getTenantId())) {
            return null;
        }
        Product product = productMapper.selectByIdIgnoreTenant(device.getProductId());
        return toInternalVideoVO(profile, device, product);
    }

    public InternalVideoDeviceVO getInternalVideoDeviceByGbIdentity(String gbDeviceId, String gbDomain) {
        String normalizedGbDeviceId = trimToNull(gbDeviceId);
        if (normalizedGbDeviceId == null) {
            return null;
        }
        DeviceVideoProfile profile = deviceVideoProfileMapper.selectByGbIdentityIgnoreTenant(normalizedGbDeviceId, trimToNull(gbDomain));
        if (profile == null) {
            return null;
        }
        Device device = getDeviceOrThrow(profile.getDeviceId(), true);
        if (device == null || !tenantVisible(profile.getTenantId())) {
            return null;
        }
        Product product = productMapper.selectByIdIgnoreTenant(device.getProductId());
        return toInternalVideoVO(profile, device, product);
    }

    public List<InternalVideoChannelVO> listInternalChannels(Long deviceId) {
        InternalVideoDeviceVO videoDevice = getInternalVideoDevice(deviceId);
        if (videoDevice == null) {
            return List.of();
        }
        return deviceVideoChannelMapper.selectByDeviceIdIgnoreTenant(deviceId)
                .stream()
                .map(this::toInternalChannelVO)
                .toList();
    }

    @Transactional
    public void applyRuntimeStatus(VideoDeviceStatusChangedEvent event) {
        if (event == null || event.getDeviceId() == null) {
            return;
        }
        DeviceVideoProfile profile = deviceVideoProfileMapper.selectByDeviceIdIgnoreTenant(event.getDeviceId());
        if (profile == null || !tenantMatches(event.getTenantId(), profile.getTenantId())) {
            return;
        }
        VideoDeviceStatus status = parseVideoStatus(event.getStatus());
        if (status == null) {
            return;
        }
        LocalDateTime changedAt = event.getStatusChangedAt() != null ? event.getStatusChangedAt() : LocalDateTime.now();
        profile.setStatus(status);
        if (status == VideoDeviceStatus.ONLINE) {
            profile.setLastRegisteredAt(changedAt);
        }
        deviceVideoProfileMapper.updateById(profile);
        deviceService.updateRuntimeConnectionState(
                profile.getTenantId(),
                profile.getDeviceId(),
                status == VideoDeviceStatus.ONLINE ? OnlineStatus.ONLINE : OnlineStatus.OFFLINE,
                changedAt
        );
    }

    @Transactional
    public void applyDeviceInfo(VideoDeviceInfoSyncedEvent event) {
        if (event == null || event.getDeviceId() == null) {
            return;
        }
        DeviceVideoProfile profile = deviceVideoProfileMapper.selectByDeviceIdIgnoreTenant(event.getDeviceId());
        if (profile == null || !tenantMatches(event.getTenantId(), profile.getTenantId())) {
            return;
        }
        profile.setManufacturer(trimToNull(event.getManufacturer()));
        profile.setModel(trimToNull(event.getModel()));
        profile.setFirmware(trimToNull(event.getFirmware()));
        deviceVideoProfileMapper.updateById(profile);
    }

    @Transactional
    public void applyChannels(VideoChannelsSyncedEvent event) {
        if (event == null || event.getDeviceId() == null) {
            return;
        }
        DeviceVideoProfile profile = deviceVideoProfileMapper.selectByDeviceIdIgnoreTenant(event.getDeviceId());
        if (profile == null || !tenantMatches(event.getTenantId(), profile.getTenantId())) {
            return;
        }
        deviceVideoChannelMapper.delete(new LambdaQueryWrapper<DeviceVideoChannel>()
                .eq(DeviceVideoChannel::getDeviceId, event.getDeviceId()));
        List<VideoChannelsSyncedEvent.ChannelItem> channels = event.getChannels() == null ? List.of() : event.getChannels();
        for (VideoChannelsSyncedEvent.ChannelItem item : channels) {
            String channelId = trimToNull(item.getChannelId());
            if (channelId == null) {
                continue;
            }
            DeviceVideoChannel channel = new DeviceVideoChannel();
            channel.setTenantId(profile.getTenantId());
            channel.setDeviceId(event.getDeviceId());
            channel.setChannelId(channelId);
            channel.setName(trimToNull(item.getName()));
            channel.setManufacturer(trimToNull(item.getManufacturer()));
            channel.setModel(trimToNull(item.getModel()));
            channel.setStatus(parseVideoStatus(item.getStatus(), VideoDeviceStatus.OFFLINE));
            channel.setPtzType(item.getPtzType());
            channel.setSubCount(item.getSubCount());
            channel.setLongitude(item.getLongitude());
            channel.setLatitude(item.getLatitude());
            deviceVideoChannelMapper.insert(channel);
        }
    }

    private DeviceVideoProfile getProfileOrThrow(Long deviceId) {
        DeviceVideoProfile profile = deviceVideoProfileMapper.selectById(deviceId);
        if (profile == null) {
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        return profile;
    }

    private Device getDeviceOrThrow(Long deviceId, boolean ignoreTenant) {
        Device device = ignoreTenant ? deviceMapper.selectByIdIgnoreTenant(deviceId) : deviceMapper.selectById(deviceId);
        if (device == null || device.getDeletedAt() != null) {
            if (ignoreTenant) {
                return null;
            }
            throw new BizException(ResultCode.VIDEO_DEVICE_NOT_FOUND);
        }
        return device;
    }

    private void ensureVideoDeviceExists(Long deviceId) {
        getProfileOrThrow(deviceId);
        getDeviceOrThrow(deviceId, false);
    }

    private void fillProfile(DeviceVideoProfile profile, DeviceVideoCreateDTO dto) {
        profile.setStreamMode(dto.getStreamMode());
        profile.setGbDeviceId(trimToNull(dto.getGbDeviceId()));
        profile.setGbDomain(trimToNull(dto.getGbDomain()));
        profile.setTransport(trimToNull(dto.getTransport()));
        profile.setSipPassword(trimToNull(dto.getSipPassword()));
        profile.setIp(trimToNull(dto.getIp()));
        profile.setPort(dto.getPort());
        profile.setSourceUrl(trimToNull(dto.getSourceUrl()));
        profile.setManufacturer(trimToNull(dto.getManufacturer()));
        profile.setModel(trimToNull(dto.getModel()));
        profile.setFirmware(trimToNull(dto.getFirmware()));
    }

    private void fillProfile(DeviceVideoProfile profile, DeviceVideoUpdateDTO dto) {
        if (dto.getStreamMode() != null) {
            profile.setStreamMode(dto.getStreamMode());
        }
        if (dto.getGbDeviceId() != null) {
            profile.setGbDeviceId(trimToNull(dto.getGbDeviceId()));
        }
        if (dto.getGbDomain() != null) {
            profile.setGbDomain(trimToNull(dto.getGbDomain()));
        }
        if (dto.getTransport() != null) {
            profile.setTransport(trimToNull(dto.getTransport()));
        }
        if (dto.getSipPassword() != null) {
            profile.setSipPassword(trimToNull(dto.getSipPassword()));
        }
        if (dto.getIp() != null) {
            profile.setIp(trimToNull(dto.getIp()));
        }
        if (dto.getPort() != null) {
            profile.setPort(dto.getPort());
        }
        if (dto.getSourceUrl() != null) {
            profile.setSourceUrl(trimToNull(dto.getSourceUrl()));
        }
        if (dto.getManufacturer() != null) {
            profile.setManufacturer(trimToNull(dto.getManufacturer()));
        }
        if (dto.getModel() != null) {
            profile.setModel(trimToNull(dto.getModel()));
        }
        if (dto.getFirmware() != null) {
            profile.setFirmware(trimToNull(dto.getFirmware()));
        }
    }

    private void normalizeProfile(DeviceVideoProfile profile) {
        if (profile.getStreamMode() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "接入方式不能为空");
        }
        if (profile.getStreamMode() == StreamMode.GB28181) {
            if (trimToNull(profile.getGbDeviceId()) == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "GB 设备编号不能为空");
            }
            if (trimToNull(profile.getTransport()) == null) {
                profile.setTransport("UDP");
            }
            String sipPassword = trimToNull(profile.getSipPassword());
            if (sipPassword == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "GB28181 设备必须填写设备级 SIP 密码");
            }
            profile.setSipPassword(sipPassword);
            return;
        }

        profile.setGbDeviceId(null);
        profile.setGbDomain(null);
        profile.setTransport(null);
        profile.setSipPassword(null);
        if (trimToNull(profile.getSourceUrl()) == null) {
            profile.setSourceUrl(buildProxySourceUrl(profile.getStreamMode(), profile.getIp(), profile.getPort()));
        }
        if (trimToNull(profile.getSourceUrl()) == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频源地址不能为空");
        }
    }

    private void alignManagedStatus(DeviceVideoProfile profile) {
        profile.setStatus(profile.getStreamMode() == StreamMode.GB28181 ? VideoDeviceStatus.OFFLINE : VideoDeviceStatus.ONLINE);
        if (profile.getStatus() == VideoDeviceStatus.ONLINE && profile.getLastRegisteredAt() == null) {
            profile.setLastRegisteredAt(LocalDateTime.now());
        }
    }

    private void assertIdentityAvailable(DeviceVideoProfile profile, Long excludeDeviceId) {
        LambdaQueryWrapper<DeviceVideoProfile> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceVideoProfile::getTenantId, profile.getTenantId());
        wrapper.eq(DeviceVideoProfile::getStreamMode, profile.getStreamMode());
        if (excludeDeviceId != null) {
            wrapper.ne(DeviceVideoProfile::getDeviceId, excludeDeviceId);
        }

        boolean checkable = false;
        if (profile.getStreamMode() == StreamMode.GB28181 && trimToNull(profile.getGbDeviceId()) != null) {
            wrapper.eq(DeviceVideoProfile::getGbDeviceId, profile.getGbDeviceId());
            checkable = true;
        } else if ((profile.getStreamMode() == StreamMode.RTSP || profile.getStreamMode() == StreamMode.RTMP)
                && trimToNull(profile.getSourceUrl()) != null) {
            wrapper.eq(DeviceVideoProfile::getSourceUrl, profile.getSourceUrl());
            checkable = true;
        }
        if (!checkable) {
            return;
        }
        if (deviceVideoProfileMapper.selectCount(wrapper) > 0) {
            throw new BizException(ResultCode.VIDEO_DEVICE_EXISTS, buildDuplicateMessage(profile));
        }
    }

    private Device buildLinkedDevice(Product product, String displayName, DeviceVideoProfile profile) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        Device device = new Device();
        device.setTenantId(tenantId);
        device.setProductId(product.getId());
        device.setProjectId(resolveLinkedProjectId(product, resolveCurrentDataScope()));
        device.setDeviceName(generateLinkedDeviceName(product.getProductKey(), profile.getStreamMode()));
        device.setNickname(trimToNull(displayName));
        device.setDescription(buildLinkedDeviceDescription(displayName));
        device.setTags("[]");
        device.setDeviceSecret(generateDeviceSecret());
        device.setIpAddress(trimToNull(profile.getIp()));
        device.setCreatedBy(userId);
        applyManagedStatusToDevice(device, profile);
        return device;
    }

    private void applyManagedStatusToDevice(Device device, DeviceVideoProfile profile) {
        if (profile.getStatus() == VideoDeviceStatus.ONLINE) {
            device.setStatus(DeviceStatus.ACTIVE);
            device.setOnlineStatus(OnlineStatus.ONLINE);
            if (device.getActivatedAt() == null) {
                device.setActivatedAt(LocalDateTime.now());
            }
            device.setLastOnlineAt(LocalDateTime.now());
            return;
        }
        if (device.getStatus() == null) {
            device.setStatus(DeviceStatus.INACTIVE);
        }
        device.setOnlineStatus(OnlineStatus.OFFLINE);
    }

    private void bindScopedGroups(Long deviceId) {
        List<Long> staticGroupIds = deviceGroupService.filterStaticGroupIds(resolveLinkedGroupIds(resolveCurrentDataScope()));
        deviceGroupService.syncDeviceGroups(deviceId, staticGroupIds);
        deviceGroupService.rebuildDynamicGroupsForDevice(deviceId);
    }

    private DataScopeContext resolveCurrentDataScope() {
        Long userId = AppContextHolder.getUserId();
        if (userId == null) {
            return null;
        }
        DataScopeResolver resolver = dataScopeResolverProvider.getIfAvailable();
        if (resolver == null) {
            return null;
        }
        return resolver.resolve(userId, AppContextHolder.getTenantId());
    }

    private Long resolveLinkedProjectId(Product product, DataScopeContext dataScope) {
        if (product.getProjectId() != null) {
            return product.getProjectId();
        }
        if (dataScope == null || dataScope.getProjectIds() == null || dataScope.getProjectIds().size() != 1) {
            return null;
        }
        return dataScope.getProjectIds().get(0);
    }

    private List<Long> resolveLinkedGroupIds(DataScopeContext dataScope) {
        if (dataScope == null || dataScope.getGroupIds() == null || dataScope.getGroupIds().isEmpty()) {
            return List.of();
        }
        return dataScope.getGroupIds().stream()
                .map(this::parseScopeGroupId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
    }

    private Long parseScopeGroupId(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        try {
            return Long.parseLong(normalized);
        } catch (NumberFormatException ignore) {
            return null;
        }
    }

    private List<Long> resolveKeywordMatchedDeviceIds(Long tenantId, String keyword) {
        Set<Long> matchedIds = new LinkedHashSet<>();
        deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                        .eq(Device::getTenantId, tenantId)
                        .isNull(Device::getDeletedAt)
                        .and(condition -> condition.like(Device::getDeviceName, keyword).or().like(Device::getNickname, keyword)))
                .stream()
                .map(Device::getId)
                .filter(Objects::nonNull)
                .forEach(matchedIds::add);

        List<Long> productIds = productMapper.selectList(new LambdaQueryWrapper<Product>()
                        .eq(Product::getTenantId, tenantId)
                        .and(condition -> condition.like(Product::getName, keyword).or().like(Product::getProductKey, keyword)))
                .stream()
                .map(Product::getId)
                .filter(Objects::nonNull)
                .toList();
        if (!productIds.isEmpty()) {
            deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                            .eq(Device::getTenantId, tenantId)
                            .isNull(Device::getDeletedAt)
                            .in(Device::getProductId, productIds))
                    .stream()
                    .map(Device::getId)
                    .filter(Objects::nonNull)
                    .forEach(matchedIds::add);
        }
        return new ArrayList<>(matchedIds);
    }

    private Map<Long, Device> loadDeviceMap(List<Long> deviceIds, boolean ignoreTenant) {
        if (deviceIds == null || deviceIds.isEmpty()) {
            return Map.of();
        }
        List<Device> devices = ignoreTenant
                ? deviceIds.stream()
                        .map(deviceMapper::selectByIdIgnoreTenant)
                        .filter(Objects::nonNull)
                        .filter(device -> device.getDeletedAt() == null)
                        .toList()
                : deviceMapper.selectBatchIds(deviceIds).stream()
                        .filter(Objects::nonNull)
                        .filter(device -> device.getDeletedAt() == null)
                        .toList();
        return devices.stream().collect(Collectors.toMap(Device::getId, Function.identity()));
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
                .collect(Collectors.toMap(Product::getId, Function.identity()));
    }

    private DeviceVideoVO toVideoVO(DeviceVideoProfile profile, Device device, Map<Long, Product> productMap) {
        Product product = device == null ? null : productMap.get(device.getProductId());
        DeviceVideoVO vo = new DeviceVideoVO();
        vo.setId(profile.getDeviceId());
        vo.setProductId(device == null ? null : device.getProductId());
        vo.setProductKey(product == null ? null : product.getProductKey());
        vo.setProductName(product == null ? null : product.getName());
        vo.setName(resolveDisplayName(device));
        vo.setDeviceName(device == null ? null : device.getDeviceName());
        vo.setGbDeviceId(profile.getGbDeviceId());
        vo.setGbDomain(profile.getGbDomain());
        vo.setTransport(profile.getTransport());
        vo.setSipAuthEnabled(trimToNull(profile.getSipPassword()) != null);
        vo.setStreamMode(profile.getStreamMode());
        vo.setIp(profile.getIp());
        vo.setPort(profile.getPort());
        vo.setSourceUrl(profile.getSourceUrl());
        vo.setManufacturer(profile.getManufacturer());
        vo.setModel(profile.getModel());
        vo.setFirmware(profile.getFirmware());
        vo.setStatus(profile.getStatus());
        vo.setLastRegisteredAt(profile.getLastRegisteredAt());
        vo.setCreatedAt(device == null ? profile.getCreatedAt() : device.getCreatedAt());
        return vo;
    }

    private InternalVideoDeviceVO toInternalVideoVO(DeviceVideoProfile profile, Device device, Product product) {
        InternalVideoDeviceVO vo = new InternalVideoDeviceVO();
        vo.setDeviceId(profile.getDeviceId());
        vo.setTenantId(profile.getTenantId());
        vo.setProductId(device == null ? null : device.getProductId());
        vo.setProductKey(product == null ? null : product.getProductKey());
        vo.setName(resolveDisplayName(device));
        vo.setGbDeviceId(profile.getGbDeviceId());
        vo.setGbDomain(profile.getGbDomain());
        vo.setTransport(profile.getTransport());
        vo.setSipPassword(profile.getSipPassword());
        vo.setStreamMode(profile.getStreamMode() == null ? null : profile.getStreamMode().name());
        vo.setIp(profile.getIp());
        vo.setPort(profile.getPort());
        vo.setSourceUrl(profile.getSourceUrl());
        vo.setManufacturer(profile.getManufacturer());
        vo.setModel(profile.getModel());
        vo.setFirmware(profile.getFirmware());
        vo.setStatus(profile.getStatus() == null ? null : profile.getStatus().name());
        vo.setLastRegisteredAt(profile.getLastRegisteredAt());
        return vo;
    }

    private DeviceVideoChannelVO toChannelVO(DeviceVideoChannel channel) {
        DeviceVideoChannelVO vo = new DeviceVideoChannelVO();
        vo.setId(channel.getId());
        vo.setDeviceId(channel.getDeviceId());
        vo.setChannelId(channel.getChannelId());
        vo.setName(channel.getName());
        vo.setManufacturer(channel.getManufacturer());
        vo.setModel(channel.getModel());
        vo.setStatus(channel.getStatus());
        vo.setPtzType(channel.getPtzType());
        vo.setSubCount(channel.getSubCount());
        vo.setLongitude(channel.getLongitude());
        vo.setLatitude(channel.getLatitude());
        vo.setCreatedAt(channel.getCreatedAt());
        return vo;
    }

    private InternalVideoChannelVO toInternalChannelVO(DeviceVideoChannel channel) {
        InternalVideoChannelVO vo = new InternalVideoChannelVO();
        vo.setId(channel.getId());
        vo.setDeviceId(channel.getDeviceId());
        vo.setChannelId(channel.getChannelId());
        vo.setName(channel.getName());
        vo.setManufacturer(channel.getManufacturer());
        vo.setModel(channel.getModel());
        vo.setStatus(channel.getStatus() == null ? null : channel.getStatus().name());
        vo.setPtzType(channel.getPtzType());
        vo.setSubCount(channel.getSubCount());
        vo.setLongitude(channel.getLongitude());
        vo.setLatitude(channel.getLatitude());
        vo.setCreatedAt(channel.getCreatedAt());
        vo.setUpdatedAt(channel.getUpdatedAt());
        return vo;
    }

    private Product getProductOrThrow(String productKey, Long tenantId) {
        String normalizedProductKey = trimToNull(productKey);
        if (normalizedProductKey == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "产品不能为空");
        }
        Product product = productMapper.selectOne(new LambdaQueryWrapper<Product>()
                .eq(Product::getTenantId, tenantId)
                .eq(Product::getProductKey, normalizedProductKey)
                .last("LIMIT 1"));
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return product;
    }

    private void validateProductProtocol(Product product, StreamMode streamMode) {
        if (product.getProtocol() == null || streamMode == null) {
            return;
        }
        if (!streamMode.name().equalsIgnoreCase(product.getProtocol().name())) {
            throw new BizException(ResultCode.PARAM_ERROR, "视频设备接入方式必须与产品协议一致");
        }
    }

    private void increaseProductDeviceCount(Product product, int increment) {
        int currentCount = product.getDeviceCount() == null ? 0 : product.getDeviceCount();
        product.setDeviceCount(currentCount + increment);
        productMapper.updateById(product);
    }

    private void persistProfile(DeviceVideoProfile profile, boolean create) {
        try {
            if (create) {
                deviceVideoProfileMapper.insert(profile);
            } else {
                deviceVideoProfileMapper.updateById(profile);
            }
        } catch (DuplicateKeyException ex) {
            throw new BizException(ResultCode.VIDEO_DEVICE_EXISTS, buildDuplicateMessage(profile));
        }
    }

    private boolean tenantVisible(Long profileTenantId) {
        Long tenantId = AppContextHolder.getTenantId();
        return tenantId == null || Objects.equals(tenantId, profileTenantId);
    }

    private boolean tenantMatches(Long eventTenantId, Long actualTenantId) {
        return eventTenantId == null || Objects.equals(eventTenantId, actualTenantId);
    }

    private String resolveDisplayName(Device device) {
        if (device == null) {
            return null;
        }
        String nickname = trimToNull(device.getNickname());
        return nickname != null ? nickname : device.getDeviceName();
    }

    private String buildDuplicateMessage(DeviceVideoProfile profile) {
        if (profile.getStreamMode() == StreamMode.GB28181) {
            return "当前 GB 设备编号已存在视频设备";
        }
        return "当前视频源地址已存在视频设备";
    }

    private String buildProxySourceUrl(StreamMode streamMode, String ip, Integer port) {
        String host = trimToNull(ip);
        if (host == null) {
            return null;
        }
        int resolvedPort = port != null && port > 0 ? port : (streamMode == StreamMode.RTMP ? 1935 : 554);
        String protocol = streamMode == StreamMode.RTMP ? "rtmp" : "rtsp";
        return protocol + "://" + host + ":" + resolvedPort + "/";
    }

    private String generateDeviceSecret() {
        StringBuilder sb = new StringBuilder(32);
        for (int i = 0; i < 32; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }

    private String generateLinkedDeviceName(String productKey, StreamMode streamMode) {
        String prefix = normalizeLinkedDeviceNamePart(productKey);
        String protocol = streamMode == null ? "video" : streamMode.name().toLowerCase(Locale.ROOT);
        String timestamp = LocalDateTime.now().format(LINKED_DEVICE_NAME_TIME_FORMATTER);
        String random = String.format("%04d", ThreadLocalRandom.current().nextInt(10000));
        String candidate = prefix + "." + protocol + "." + timestamp + "." + random;
        return candidate.length() <= 64 ? candidate : candidate.substring(0, 64);
    }

    private String normalizeLinkedDeviceNamePart(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return "video";
        }
        normalized = normalized.replaceAll("[^A-Za-z0-9:_.-]+", "-");
        normalized = normalized.replaceAll("-{2,}", "-");
        normalized = normalized.replaceAll("^[^A-Za-z0-9]+", "");
        normalized = normalized.replaceAll("[^A-Za-z0-9]+$", "");
        if (normalized.isEmpty()) {
            return "video";
        }
        return normalized.length() > 24 ? normalized.substring(0, 24) : normalized;
    }

    private String buildLinkedDeviceDescription(String name) {
        String displayName = trimToNull(name);
        return displayName == null ? "视频设备接入自动创建" : "视频设备接入自动创建: " + displayName;
    }

    private VideoDeviceStatus parseVideoStatus(String status) {
        return parseVideoStatus(status, null);
    }

    private VideoDeviceStatus parseVideoStatus(String status, VideoDeviceStatus fallback) {
        String normalized = trimToNull(status);
        if (normalized == null) {
            return fallback;
        }
        try {
            return VideoDeviceStatus.valueOf(normalized.toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return fallback;
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
