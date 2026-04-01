package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.EventLevel;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.devicedata.DeviceEventQueryDTO;
import com.songhg.firefly.iot.device.dto.devicedata.DeviceEventVO;
import com.songhg.firefly.iot.device.dto.devicedata.DeviceEventWriteDTO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryAggregateDTO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryAggregateVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryDataVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryLatestVO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryQueryDTO;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryWriteDTO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceEvent;
import com.songhg.firefly.iot.device.entity.DeviceTelemetry;
import com.songhg.firefly.iot.device.mapper.DeviceEventMapper;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceTelemetryMapper;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceDataService {

    private final DeviceTelemetryMapper telemetryMapper;
    private final DeviceEventMapper eventMapper;
    private final DeviceMapper deviceMapper;
    private final ObjectMapper objectMapper;

    // ==================== Telemetry ====================

    @Transactional
    public void writeTelemetry(Long deviceId, TelemetryWriteDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Device device = deviceMapper.selectById(deviceId);
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }

        LocalDateTime ts = dto.getTimestamp() != null
                ? LocalDateTime.ofInstant(Instant.ofEpochMilli(dto.getTimestamp()), ZoneId.systemDefault())
                : LocalDateTime.now();

        List<DeviceTelemetry> records = new ArrayList<>();
        for (Map.Entry<String, Object> entry : dto.getProperties().entrySet()) {
            DeviceTelemetry t = new DeviceTelemetry();
            t.setTs(ts);
            t.setTenantId(tenantId);
            t.setDeviceId(deviceId);
            t.setProductId(device.getProductId());
            t.setProperty(entry.getKey());

            Object val = entry.getValue();
            if (val instanceof Number) {
                t.setValueNumber(((Number) val).doubleValue());
            } else if (val instanceof Boolean) {
                t.setValueBool((Boolean) val);
            } else if (val != null) {
                t.setValueString(val.toString());
            }

            try {
                t.setRawPayload(objectMapper.writeValueAsString(dto.getProperties()));
            } catch (Exception ignored) {
            }
            records.add(t);
        }

        if (!records.isEmpty()) {
            telemetryMapper.batchInsert(records);
            log.debug("Telemetry written: deviceId={}, properties={}", deviceId, records.size());
        }
    }

    public List<TelemetryDataVO> queryTelemetry(TelemetryQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        return telemetryMapper.queryTelemetry(tenantId, query.getDeviceId(),
                query.getProperty(), query.getStartTime(), query.getEndTime(), query.getLimit());
    }

    public List<TelemetryAggregateVO> aggregateTelemetry(TelemetryAggregateDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        return telemetryMapper.aggregateTelemetry(tenantId, query.getDeviceId(),
                query.getProperty(), query.getStartTime(), query.getEndTime(), query.getInterval());
    }

    public List<TelemetryLatestVO> queryLatest(Long deviceId) {
        Long tenantId = AppContextHolder.getTenantId();
        return telemetryMapper.queryLatest(tenantId, deviceId);
    }

    /**
     * Kafka 上行消费场景没有 HTTP 请求上下文，不能依赖 AppContextHolder。
     * 这里直接基于消息中的 tenantId/deviceId 做归属校验并落库，保证设备真实上报
     * 的属性数据能够进入 telemetry 表，而不仅仅是更新影子。
     */
    @Transactional
    public void writeTelemetryFromMessage(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null || message.getPayload() == null || message.getPayload().isEmpty()) {
            return;
        }

        Device device = requireOwnedDevice(message.getTenantId(), message.getDeviceId());
        LocalDateTime ts = resolveOccurredAt(message.getTimestamp());

        List<DeviceTelemetry> records = new ArrayList<>();
        for (Map.Entry<String, Object> entry : message.getPayload().entrySet()) {
            DeviceTelemetry telemetry = new DeviceTelemetry();
            telemetry.setTs(ts);
            telemetry.setTenantId(device.getTenantId());
            telemetry.setDeviceId(device.getId());
            telemetry.setProductId(device.getProductId());
            telemetry.setProperty(entry.getKey());

            Object val = entry.getValue();
            if (val instanceof Number number) {
                telemetry.setValueNumber(number.doubleValue());
            } else if (val instanceof Boolean boolValue) {
                telemetry.setValueBool(boolValue);
            } else if (val != null) {
                telemetry.setValueString(val.toString());
            }

            try {
                telemetry.setRawPayload(objectMapper.writeValueAsString(message.getPayload()));
            } catch (Exception ignored) {
            }
            records.add(telemetry);
        }

        if (!records.isEmpty()) {
            telemetryMapper.batchInsert(records);
            log.debug("Telemetry written from Kafka message: deviceId={}, properties={}", device.getId(), records.size());
        }
    }

    // ==================== Device Events ====================

    @Transactional
    public void writeEvent(Long deviceId, DeviceEventWriteDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Device device = deviceMapper.selectById(deviceId);
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }

        DeviceEvent event = new DeviceEvent();
        event.setTenantId(tenantId);
        event.setDeviceId(deviceId);
        event.setProductId(device.getProductId());
        event.setEventType(dto.getEventType());
        event.setEventName(dto.getEventName());
        event.setLevel(dto.getLevel() != null ? dto.getLevel() : EventLevel.INFO);
        event.setOccurredAt(LocalDateTime.now());

        if (dto.getPayload() != null) {
            try {
                event.setPayload(objectMapper.writeValueAsString(dto.getPayload()));
            } catch (Exception ignored) {
            }
        }

        eventMapper.insert(event);
        log.debug("Device event written: deviceId={}, type={}", deviceId, dto.getEventType());
    }

    /**
     * 设备事件的异步消费写入。
     * 事件 payload 目前允许多协议自由上报，因此这里按兼容方式提取 eventType / eventName / level，
     * 提取不到时使用兜底值，避免因为某个协议 envelope 不完全一致而整条事件丢失。
     */
    @Transactional
    public void writeEventFromMessage(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null) {
            return;
        }

        Device device = requireOwnedDevice(message.getTenantId(), message.getDeviceId());
        Map<String, Object> payload = message.getPayload();

        DeviceEvent event = buildEvent(
                device,
                payload,
                resolveEventType(payload),
                resolveString(payload, "eventName", "name", "title"),
                resolveEventLevel(payload),
                resolveOccurredAt(message.getTimestamp())
        );
        eventMapper.insert(event);
        log.debug("Device event written from Kafka message: deviceId={}, type={}", device.getId(), event.getEventType());
    }

    /**
     * Persists non-business operational messages as device events so lifecycle,
     * OTA progress and command replies are observable in the unified event log.
     */
    @Transactional
    public void writeOperationalEventFromMessage(DeviceMessage message,
                                                 String fallbackEventType,
                                                 String fallbackEventName,
                                                 EventLevel defaultLevel) {
        if (message == null || message.getDeviceId() == null) {
            return;
        }

        Device device = requireOwnedDevice(message.getTenantId(), message.getDeviceId());
        Map<String, Object> payload = message.getPayload();
        String eventType = resolveString(payload, "eventType", "type", "identifier", "code");
        if (eventType == null) {
            eventType = fallbackEventType;
        }
        String eventName = resolveString(payload, "eventName", "name", "title", "serviceName", "status");
        if (eventName == null) {
            eventName = fallbackEventName;
        }

        DeviceEvent event = buildEvent(
                device,
                payload,
                eventType,
                eventName,
                resolveEventLevel(payload, defaultLevel),
                resolveOccurredAt(message.getTimestamp())
        );
        eventMapper.insert(event);
        log.debug("Operational device event written from Kafka message: deviceId={}, type={}", device.getId(), event.getEventType());
    }

    public IPage<DeviceEventVO> listEvents(DeviceEventQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<DeviceEvent> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<DeviceEvent> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceEvent::getTenantId, tenantId);
        if (query.getDeviceId() != null) {
            wrapper.eq(DeviceEvent::getDeviceId, query.getDeviceId());
        }
        if (query.getProductId() != null) {
            wrapper.eq(DeviceEvent::getProductId, query.getProductId());
        }
        if (query.getEventType() != null && !query.getEventType().isBlank()) {
            wrapper.eq(DeviceEvent::getEventType, query.getEventType());
        }
        if (query.getLevel() != null) {
            wrapper.eq(DeviceEvent::getLevel, query.getLevel());
        }
        wrapper.orderByDesc(DeviceEvent::getOccurredAt);

        IPage<DeviceEvent> result = eventMapper.selectPage(page, wrapper);
        Map<Long, String> deviceNameMap = new HashMap<>();
        List<Long> deviceIds = result.getRecords().stream()
                .map(DeviceEvent::getDeviceId)
                .filter(Objects::nonNull)
                .distinct()
                .toList();
        if (!deviceIds.isEmpty()) {
            // 事件列表面向页面用户时优先补齐业务标识，避免前端再回退展示数据库主键。
            deviceMapper.selectBatchIds(deviceIds).forEach(device -> {
                if (device != null && device.getId() != null) {
                    deviceNameMap.put(device.getId(), device.getDeviceName());
                }
            });
        }
        return result.convert(event -> toEventVO(event, deviceNameMap.get(event.getDeviceId())));
    }

    private DeviceEventVO toEventVO(DeviceEvent e, String deviceName) {
        DeviceEventVO vo = new DeviceEventVO();
        vo.setId(e.getId());
        vo.setDeviceId(e.getDeviceId());
        vo.setDeviceName(deviceName);
        vo.setProductId(e.getProductId());
        vo.setEventType(e.getEventType());
        vo.setEventName(e.getEventName());
        vo.setLevel(e.getLevel());
        vo.setPayload(e.getPayload());
        vo.setOccurredAt(e.getOccurredAt());
        vo.setCreatedAt(e.getCreatedAt());
        return vo;
    }

    private Device requireOwnedDevice(Long tenantId, Long deviceId) {
        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        if (tenantId != null && device.getTenantId() != null && !tenantId.equals(device.getTenantId())) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private LocalDateTime resolveOccurredAt(long timestamp) {
        if (timestamp <= 0) {
            return LocalDateTime.now();
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(timestamp), ZoneId.systemDefault());
    }

    private String resolveEventType(Map<String, Object> payload) {
        String eventType = resolveString(payload, "eventType", "type", "identifier", "code");
        return eventType != null ? eventType : "EVENT_REPORT";
    }

    private EventLevel resolveEventLevel(Map<String, Object> payload) {
        return resolveEventLevel(payload, EventLevel.INFO);
    }

    private EventLevel resolveEventLevel(Map<String, Object> payload, EventLevel defaultLevel) {
        String level = resolveString(payload, "level", "eventLevel", "severity");
        if (level == null) {
            return defaultLevel;
        }
        try {
            return EventLevel.valueOf(level.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            return defaultLevel;
        }
    }

    private DeviceEvent buildEvent(Device device,
                                   Map<String, Object> payload,
                                   String eventType,
                                   String eventName,
                                   EventLevel level,
                                   LocalDateTime occurredAt) {
        DeviceEvent event = new DeviceEvent();
        event.setTenantId(device.getTenantId());
        event.setDeviceId(device.getId());
        event.setProductId(device.getProductId());
        event.setEventType(eventType);
        event.setEventName(eventName);
        event.setLevel(level);
        event.setOccurredAt(occurredAt);
        if (payload != null) {
            try {
                event.setPayload(objectMapper.writeValueAsString(payload));
            } catch (Exception ignored) {
            }
        }
        return event;
    }

    private String resolveString(Map<String, Object> payload, String... keys) {
        if (payload == null || keys == null) {
            return null;
        }
        for (String key : keys) {
            Object value = payload.get(key);
            if (value == null) {
                continue;
            }
            String normalized = value.toString().trim();
            if (!normalized.isEmpty()) {
                return normalized;
            }
        }
        return null;
    }
}
