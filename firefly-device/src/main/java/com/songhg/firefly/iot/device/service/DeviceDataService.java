package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
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
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

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
        Long tenantId = TenantContextHolder.getTenantId();
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
        Long tenantId = TenantContextHolder.getTenantId();
        return telemetryMapper.queryTelemetry(tenantId, query.getDeviceId(),
                query.getProperty(), query.getStartTime(), query.getEndTime(), query.getLimit());
    }

    public List<TelemetryAggregateVO> aggregateTelemetry(TelemetryAggregateDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
        return telemetryMapper.aggregateTelemetry(tenantId, query.getDeviceId(),
                query.getProperty(), query.getStartTime(), query.getEndTime(), query.getInterval());
    }

    public List<TelemetryLatestVO> queryLatest(Long deviceId) {
        Long tenantId = TenantContextHolder.getTenantId();
        return telemetryMapper.queryLatest(tenantId, deviceId);
    }

    // ==================== Device Events ====================

    @Transactional
    public void writeEvent(Long deviceId, DeviceEventWriteDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();
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

    public IPage<DeviceEventVO> listEvents(DeviceEventQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
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
        return result.convert(this::toEventVO);
    }

    private DeviceEventVO toEventVO(DeviceEvent e) {
        DeviceEventVO vo = new DeviceEventVO();
        vo.setId(e.getId());
        vo.setDeviceId(e.getDeviceId());
        vo.setProductId(e.getProductId());
        vo.setEventType(e.getEventType());
        vo.setEventName(e.getEventName());
        vo.setLevel(e.getLevel());
        vo.setPayload(e.getPayload());
        vo.setOccurredAt(e.getOccurredAt());
        vo.setCreatedAt(e.getCreatedAt());
        return vo;
    }
}
