package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.RemoteConfigAssignmentStatus;
import com.songhg.firefly.iot.common.enums.RemoteConfigStatus;
import com.songhg.firefly.iot.common.enums.RemoteConfigTargetType;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigAssignmentVO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigCreateDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigDeployDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigDeployResultVO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigQueryDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigUpdateDTO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigVO;
import com.songhg.firefly.iot.device.dto.remoteconfig.RemoteConfigVersionVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceGroupMember;
import com.songhg.firefly.iot.device.entity.RemoteConfig;
import com.songhg.firefly.iot.device.entity.RemoteConfigAssignment;
import com.songhg.firefly.iot.device.entity.RemoteConfigVersion;
import com.songhg.firefly.iot.device.mapper.DeviceGroupMemberMapper;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.RemoteConfigAssignmentMapper;
import com.songhg.firefly.iot.device.mapper.RemoteConfigMapper;
import com.songhg.firefly.iot.device.mapper.RemoteConfigVersionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * 设备远程配置：配置模板 + 不可变版本 + 按产品/分组/设备下发 + 回滚 + 下发记录。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RemoteConfigService {

    private final RemoteConfigMapper configMapper;
    private final RemoteConfigVersionMapper versionMapper;
    private final RemoteConfigAssignmentMapper assignmentMapper;
    private final DeviceMapper deviceMapper;
    private final DeviceGroupMemberMapper groupMemberMapper;
    private final DeviceShadowService shadowService;
    private final DeviceMessageProducer messageProducer;
    private final ObjectMapper objectMapper;

    @Transactional
    public RemoteConfigVO create(RemoteConfigCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        RemoteConfig config = new RemoteConfig();
        config.setTenantId(tenantId);
        config.setCreatedBy(AppContextHolder.getUserId());
        config.setProjectId(dto.getProjectId());
        config.setName(requireText(dto.getName(), "配置名称"));
        config.setDescription(normalizeOptional(dto.getDescription()));
        config.setTargetType(dto.getTargetType());
        config.setTargetId(dto.getTargetId());
        config.setConfigJson(normalizeJson(dto.getConfigJson()));
        config.setVersion(0);
        config.setStatus(RemoteConfigStatus.DRAFT);
        configMapper.insert(config);
        log.info("Remote config created: id={}, name={}", config.getId(), config.getName());
        return toVO(config);
    }

    public IPage<RemoteConfigVO> list(RemoteConfigQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<RemoteConfig> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<RemoteConfig> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(RemoteConfig::getTenantId, tenantId);
        if (StringUtils.hasText(query.getKeyword())) {
            wrapper.like(RemoteConfig::getName, query.getKeyword().trim());
        }
        if (query.getStatus() != null) {
            wrapper.eq(RemoteConfig::getStatus, query.getStatus());
        }
        if (query.getTargetType() != null) {
            wrapper.eq(RemoteConfig::getTargetType, query.getTargetType());
        }
        wrapper.orderByDesc(RemoteConfig::getCreatedAt);
        IPage<RemoteConfig> result = configMapper.selectPage(page, wrapper);
        Page<RemoteConfigVO> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(result.getRecords().stream().map(this::toVO).toList());
        return voPage;
    }

    public RemoteConfigVO get(Long id) {
        return toVO(requireOwnedConfig(id));
    }

    @Transactional
    public RemoteConfigVO update(Long id, RemoteConfigUpdateDTO dto) {
        RemoteConfig config = requireOwnedConfig(id);
        if (dto.getName() != null) {
            config.setName(requireText(dto.getName(), "配置名称"));
        }
        config.setDescription(normalizeOptional(dto.getDescription()));
        config.setProjectId(dto.getProjectId());
        if (dto.getTargetType() != null) {
            config.setTargetType(dto.getTargetType());
        }
        config.setTargetId(dto.getTargetId());
        if (dto.getConfigJson() != null) {
            config.setConfigJson(normalizeJson(dto.getConfigJson()));
        }
        configMapper.updateById(config);
        return toVO(config);
    }

    @Transactional
    public void delete(Long id) {
        RemoteConfig config = requireOwnedConfig(id);
        configMapper.deleteById(config.getId());
        log.info("Remote config deleted: id={}", id);
    }

    /**
     * 发布：版本号 +1 并写入不可变版本快照。
     */
    @Transactional
    public RemoteConfigVO publish(Long id) {
        RemoteConfig config = requireOwnedConfig(id);
        int nextVersion = (config.getVersion() == null ? 0 : config.getVersion()) + 1;
        config.setVersion(nextVersion);
        config.setStatus(RemoteConfigStatus.PUBLISHED);
        configMapper.updateById(config);

        RemoteConfigVersion version = new RemoteConfigVersion();
        version.setTenantId(config.getTenantId());
        version.setConfigId(config.getId());
        version.setVersion(nextVersion);
        version.setConfigJson(config.getConfigJson());
        version.setCreatedBy(AppContextHolder.getUserId());
        versionMapper.insert(version);
        log.info("Remote config published: id={}, version={}", id, nextVersion);
        return toVO(config);
    }

    @Transactional
    public RemoteConfigVO disable(Long id) {
        RemoteConfig config = requireOwnedConfig(id);
        config.setStatus(RemoteConfigStatus.DISABLED);
        configMapper.updateById(config);
        return toVO(config);
    }

    /**
     * 回滚：以历史版本内容创建新版本，保持版本不可变语义。
     */
    @Transactional
    public RemoteConfigVO rollback(Long id, Integer version) {
        RemoteConfig config = requireOwnedConfig(id);
        RemoteConfigVersion target = versionMapper.selectOne(new LambdaQueryWrapper<RemoteConfigVersion>()
                .eq(RemoteConfigVersion::getConfigId, config.getId())
                .eq(RemoteConfigVersion::getVersion, version));
        if (target == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "指定版本不存在");
        }
        config.setConfigJson(target.getConfigJson());
        configMapper.updateById(config);
        log.info("Remote config rollback prepared: id={}, fromVersion={}", id, version);
        return publish(id);
    }

    public List<RemoteConfigVersionVO> versions(Long id) {
        RemoteConfig config = requireOwnedConfig(id);
        return versionMapper.selectList(new LambdaQueryWrapper<RemoteConfigVersion>()
                        .eq(RemoteConfigVersion::getConfigId, config.getId())
                        .orderByDesc(RemoteConfigVersion::getVersion))
                .stream()
                .map(item -> {
                    RemoteConfigVersionVO vo = new RemoteConfigVersionVO();
                    vo.setVersion(item.getVersion());
                    vo.setConfigJson(item.getConfigJson());
                    vo.setCreatedBy(item.getCreatedBy());
                    vo.setCreatedAt(item.getCreatedAt());
                    return vo;
                })
                .toList();
    }

    /**
     * 下发：解析目标设备，写入影子期望值并投递 PROPERTY_SET 下行，记录逐设备结果。
     */
    @Transactional
    public RemoteConfigDeployResultVO deploy(Long id, RemoteConfigDeployDTO dto) {
        RemoteConfig config = requireOwnedConfig(id);
        if (config.getStatus() != RemoteConfigStatus.PUBLISHED) {
            throw new BizException(ResultCode.PARAM_ERROR, "仅已发布配置可下发");
        }
        int version = dto != null && dto.getVersion() != null ? dto.getVersion() : config.getVersion();
        String payload = version == config.getVersion()
                ? config.getConfigJson()
                : requireVersionContent(config.getId(), version);
        Map<String, Object> configMap = parseConfigMap(payload);

        List<Device> devices = resolveTargetDevices(config);
        int success = 0;
        int failed = 0;
        for (Device device : devices) {
            try {
                shadowService.updateDesired(device.getId(), configMap);
                DeviceMessage message = DeviceMessage.builder()
                        .messageId(UUID.randomUUID().toString())
                        .tenantId(device.getTenantId())
                        .productId(device.getProductId())
                        .deviceId(device.getId())
                        .deviceName(device.getDeviceName())
                        .type(DeviceMessage.MessageType.PROPERTY_SET)
                        .payload(configMap)
                        .timestamp(System.currentTimeMillis())
                        .build();
                messageProducer.publishDownstream(message);
                upsertAssignment(config, version, device, RemoteConfigAssignmentStatus.DELIVERED,
                        message.getMessageId(), null);
                success++;
            } catch (Exception ex) {
                log.warn("Remote config deploy failed: configId={}, deviceId={}, error={}",
                        config.getId(), device.getId(), ex.getMessage());
                upsertAssignment(config, version, device, RemoteConfigAssignmentStatus.FAILED,
                        null, truncate(ex.getMessage()));
                failed++;
            }
        }
        log.info("Remote config deployed: id={}, version={}, requested={}, success={}, failed={}",
                config.getId(), version, devices.size(), success, failed);
        return new RemoteConfigDeployResultVO(devices.size(), success, failed);
    }

    public List<RemoteConfigAssignmentVO> assignments(Long id) {
        RemoteConfig config = requireOwnedConfig(id);
        List<RemoteConfigAssignment> assignments = assignmentMapper.selectList(
                new LambdaQueryWrapper<RemoteConfigAssignment>()
                        .eq(RemoteConfigAssignment::getConfigId, config.getId())
                        .orderByDesc(RemoteConfigAssignment::getId));
        if (assignments.isEmpty()) {
            return List.of();
        }
        List<Long> deviceIds = assignments.stream().map(RemoteConfigAssignment::getDeviceId)
                .filter(Objects::nonNull).distinct().toList();
        Map<Long, String> deviceNameMap = deviceIds.isEmpty()
                ? Map.of()
                : deviceMapper.selectBatchIds(deviceIds).stream()
                .collect(Collectors.toMap(Device::getId, Device::getDeviceName));
        List<RemoteConfigAssignmentVO> result = new ArrayList<>(assignments.size());
        for (RemoteConfigAssignment assignment : assignments) {
            RemoteConfigAssignmentVO vo = new RemoteConfigAssignmentVO();
            vo.setId(assignment.getId());
            vo.setConfigId(assignment.getConfigId());
            vo.setConfigVersion(assignment.getConfigVersion());
            vo.setDeviceId(assignment.getDeviceId());
            vo.setDeviceName(deviceNameMap.get(assignment.getDeviceId()));
            vo.setStatus(assignment.getStatus());
            vo.setMessageId(assignment.getMessageId());
            vo.setErrorMessage(assignment.getErrorMessage());
            vo.setCreatedAt(assignment.getCreatedAt());
            vo.setUpdatedAt(assignment.getUpdatedAt());
            result.add(vo);
        }
        return result;
    }

    private List<Device> resolveTargetDevices(RemoteConfig config) {
        if (config.getTargetType() == null || config.getTargetId() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "未配置下发目标");
        }
        Long tenantId = config.getTenantId();
        return switch (config.getTargetType()) {
            case PRODUCT -> deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                    .eq(Device::getTenantId, tenantId)
                    .eq(Device::getProductId, config.getTargetId())
                    .isNull(Device::getDeletedAt));
            case GROUP -> {
                List<Long> deviceIds = groupMemberMapper.selectList(new LambdaQueryWrapper<DeviceGroupMember>()
                                .eq(DeviceGroupMember::getGroupId, config.getTargetId()))
                        .stream()
                        .map(DeviceGroupMember::getDeviceId)
                        .filter(Objects::nonNull)
                        .distinct()
                        .toList();
                yield deviceIds.isEmpty() ? List.of() : deviceMapper.selectList(new LambdaQueryWrapper<Device>()
                        .eq(Device::getTenantId, tenantId)
                        .in(Device::getId, deviceIds)
                        .isNull(Device::getDeletedAt));
            }
            case DEVICE -> {
                Device device = deviceMapper.selectOne(new LambdaQueryWrapper<Device>()
                        .eq(Device::getTenantId, tenantId)
                        .eq(Device::getId, config.getTargetId())
                        .isNull(Device::getDeletedAt));
                yield device == null ? List.of() : List.of(device);
            }
        };
    }

    private void upsertAssignment(RemoteConfig config, int version, Device device,
                                  RemoteConfigAssignmentStatus status, String messageId, String errorMessage) {
        RemoteConfigAssignment existing = assignmentMapper.selectOne(new LambdaQueryWrapper<RemoteConfigAssignment>()
                .eq(RemoteConfigAssignment::getConfigId, config.getId())
                .eq(RemoteConfigAssignment::getConfigVersion, version)
                .eq(RemoteConfigAssignment::getDeviceId, device.getId()));
        if (existing == null) {
            RemoteConfigAssignment assignment = new RemoteConfigAssignment();
            assignment.setTenantId(config.getTenantId());
            assignment.setConfigId(config.getId());
            assignment.setConfigVersion(version);
            assignment.setDeviceId(device.getId());
            assignment.setStatus(status);
            assignment.setMessageId(messageId);
            assignment.setErrorMessage(errorMessage);
            assignmentMapper.insert(assignment);
            return;
        }
        existing.setStatus(status);
        existing.setMessageId(messageId);
        existing.setErrorMessage(errorMessage);
        assignmentMapper.updateById(existing);
    }

    private String requireVersionContent(Long configId, int version) {
        RemoteConfigVersion target = versionMapper.selectOne(new LambdaQueryWrapper<RemoteConfigVersion>()
                .eq(RemoteConfigVersion::getConfigId, configId)
                .eq(RemoteConfigVersion::getVersion, version));
        if (target == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "指定版本不存在");
        }
        return target.getConfigJson();
    }

    private RemoteConfig requireOwnedConfig(Long id) {
        Long tenantId = AppContextHolder.getTenantId();
        RemoteConfig config = configMapper.selectOne(new LambdaQueryWrapper<RemoteConfig>()
                .eq(RemoteConfig::getId, id)
                .eq(RemoteConfig::getTenantId, tenantId));
        if (config == null) {
            throw new BizException(ResultCode.NOT_FOUND, "远程配置不存在");
        }
        return config;
    }

    private Map<String, Object> parseConfigMap(String json) {
        try {
            return objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<LinkedHashMap<String, Object>>() {
            });
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "配置内容必须是 JSON 对象");
        }
    }

    private String normalizeJson(String json) {
        String normalized = requireText(json, "配置内容");
        try {
            objectMapper.readTree(normalized);
            return normalized;
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "配置内容必须是合法 JSON");
        }
    }

    private RemoteConfigVO toVO(RemoteConfig config) {
        RemoteConfigVO vo = new RemoteConfigVO();
        vo.setId(config.getId());
        vo.setProjectId(config.getProjectId());
        vo.setName(config.getName());
        vo.setDescription(config.getDescription());
        vo.setTargetType(config.getTargetType());
        vo.setTargetId(config.getTargetId());
        vo.setConfigJson(config.getConfigJson());
        vo.setVersion(config.getVersion());
        vo.setStatus(config.getStatus());
        vo.setCreatedAt(config.getCreatedAt());
        vo.setUpdatedAt(config.getUpdatedAt());
        return vo;
    }

    private String requireText(String value, String fieldName) {
        String normalized = normalizeOptional(value);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + "不能为空");
        }
        return normalized;
    }

    private String normalizeOptional(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String truncate(String message) {
        if (message == null) {
            return null;
        }
        return message.length() > 500 ? message.substring(0, 500) : message;
    }
}
