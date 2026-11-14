package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.device.BatchOperationResultVO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCommandDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchGroupDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchTagDTO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.entity.DeviceTag;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.function.Consumer;

/**
 * 设备批量操作：逐设备执行并汇总结果，单条失败不阻断其他设备。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceBatchOperationService {

    private final DeviceService deviceService;
    private final DeviceTagService deviceTagService;
    private final DeviceGroupService deviceGroupService;
    private final DeviceMessageProducer messageProducer;
    private final DeviceMapper deviceMapper;

    public BatchOperationResultVO batchEnable(List<Long> deviceIds) {
        return execute(deviceIds, deviceService::enableDevice);
    }

    public BatchOperationResultVO batchDisable(List<Long> deviceIds) {
        return execute(deviceIds, deviceService::disableDevice);
    }

    public BatchOperationResultVO batchDelete(List<Long> deviceIds) {
        return execute(deviceIds, deviceService::deleteDevice);
    }

    public BatchOperationResultVO batchTag(DeviceBatchTagDTO dto) {
        Set<Long> tagIds = new LinkedHashSet<>(dto.getTagIds() == null ? List.of() : dto.getTagIds());
        boolean overwrite = !Boolean.FALSE.equals(dto.getOverwrite());
        Consumer<Long> action = overwrite
                ? deviceId -> deviceTagService.syncDeviceTags(deviceId, tagIds)
                : deviceId -> {
                    Set<Long> merged = new LinkedHashSet<>();
                    for (DeviceTag tag : deviceTagService.getDeviceTags(deviceId)) {
                        merged.add(tag.getId());
                    }
                    merged.addAll(tagIds);
                    deviceTagService.syncDeviceTags(deviceId, merged);
                };
        return execute(dto.getDeviceIds(), action);
    }

    public BatchOperationResultVO batchGroup(DeviceBatchGroupDTO dto) {
        Set<Long> groupIds = new LinkedHashSet<>(dto.getGroupIds() == null ? List.of() : dto.getGroupIds());
        String actionCode = StringUtils.hasText(dto.getAction())
                ? dto.getAction().trim().toUpperCase(Locale.ROOT)
                : "REPLACE";
        Consumer<Long> action = deviceId -> {
            Set<Long> current = new LinkedHashSet<>();
            for (DeviceGroup group : deviceGroupService.getDeviceGroups(deviceId)) {
                current.add(group.getId());
            }
            switch (actionCode) {
                case "ADD" -> current.addAll(groupIds);
                case "REMOVE" -> current.removeAll(groupIds);
                default -> {
                    current.clear();
                    current.addAll(groupIds);
                }
            }
            deviceGroupService.syncDeviceGroups(deviceId, current);
        };
        return execute(dto.getDeviceIds(), action);
    }

    public BatchOperationResultVO batchCommand(DeviceBatchCommandDTO dto) {
        String commandType = StringUtils.hasText(dto.getCommandType())
                ? dto.getCommandType().trim().toUpperCase(Locale.ROOT)
                : "PROPERTY_SET";
        DeviceMessage.MessageType messageType;
        if ("SERVICE_INVOKE".equals(commandType)) {
            messageType = DeviceMessage.MessageType.SERVICE_INVOKE;
        } else if ("PROPERTY_SET".equals(commandType)) {
            messageType = DeviceMessage.MessageType.PROPERTY_SET;
        } else {
            throw new BizException(ResultCode.PARAM_ERROR, "不支持的命令类型: " + dto.getCommandType());
        }

        Consumer<Long> action = deviceId -> {
            Device device = deviceMapper.selectById(deviceId);
            if (device == null) {
                throw new BizException(ResultCode.DEVICE_NOT_FOUND);
            }
            Map<String, Object> payload = new LinkedHashMap<>();
            if (messageType == DeviceMessage.MessageType.SERVICE_INVOKE) {
                payload.put("serviceName", dto.getServiceName());
                payload.put("params", dto.getParams() == null ? Map.of() : dto.getParams());
            } else {
                payload.putAll(dto.getPayload() == null ? Map.of() : dto.getPayload());
            }
            DeviceMessage message = DeviceMessage.builder()
                    .tenantId(device.getTenantId())
                    .productId(device.getProductId())
                    .deviceId(device.getId())
                    .deviceName(device.getDeviceName())
                    .type(messageType)
                    .payload(payload)
                    .timestamp(System.currentTimeMillis())
                    .build();
            messageProducer.publishDownstream(message);
        };
        return execute(dto.getDeviceIds(), action);
    }

    private BatchOperationResultVO execute(List<Long> deviceIds, Consumer<Long> action) {
        BatchOperationResultVO result = new BatchOperationResultVO();
        List<Long> ids = deviceIds == null ? List.of() : deviceIds.stream().filter(java.util.Objects::nonNull).distinct().toList();
        result.setRequested(ids.size());
        for (Long deviceId : ids) {
            try {
                action.accept(deviceId);
                result.setSuccess(result.getSuccess() + 1);
            } catch (Exception ex) {
                result.setFailed(result.getFailed() + 1);
                result.getFailures().add(new BatchOperationResultVO.Failure(deviceId, truncate(ex.getMessage())));
                log.warn("Batch device operation failed: deviceId={}, error={}", deviceId, ex.getMessage());
            }
        }
        return result;
    }

    private String truncate(String message) {
        if (message == null) {
            return null;
        }
        return message.length() > 200 ? message.substring(0, 200) : message;
    }
}
