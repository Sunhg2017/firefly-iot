package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.EventLevel;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.message.KafkaTopics;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.dto.geo.DeviceLocationHistoryQueryDTO;
import com.songhg.firefly.iot.device.entity.DeviceLocation;
import com.songhg.firefly.iot.device.entity.GeoFence;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceLocationMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceLocationService {

    private static final String DEFAULT_LOCATION_SOURCE = "GPS";
    private static final String PROPERTY_REPORT_LOCATION_SOURCE = "PROPERTY_REPORT";
    private static final String GEOFENCE_EVENT_TYPE = "geofenceAlarm";
    private static final String GEOFENCE_EVENT_NAME = "围栏告警";
    private static final String GEOFENCE_RULE_TOPIC = "/internal/geo-fence/event/report";

    private final DeviceLocationMapper locationMapper;
    private final GeoFenceService geoFenceService;
    private final DeviceMapper deviceMapper;
    private final DeviceDataService deviceDataService;
    private final DeviceMessageProducer messageProducer;

    /**
     * 上报设备位置 + 围栏检测
     */
    @Transactional
    public DeviceLocation reportLocation(DeviceLocation loc) {
        Device device = requireOwnedDevice(AppContextHolder.getTenantId(), loc.getDeviceId());
        return saveLocationAndProcess(device, loc, LocalDateTime.now());
    }

    /**
     * 属性上报中出现经纬度时，自动沉淀设备位置并执行围栏状态机。
     */
    @Transactional
    public DeviceLocation syncLocationFromPropertyReport(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null || message.getPayload() == null || message.getPayload().isEmpty()) {
            return null;
        }
        ExtractedLocation extractedLocation = extractLocation(message.getPayload());
        if (extractedLocation == null) {
            return null;
        }

        Device device = requireOwnedDevice(message.getTenantId(), message.getDeviceId());
        DeviceLocation location = new DeviceLocation();
        location.setDeviceId(device.getId());
        location.setLng(extractedLocation.lng());
        location.setLat(extractedLocation.lat());
        location.setAltitude(extractedLocation.altitude());
        location.setSpeed(extractedLocation.speed());
        location.setHeading(extractedLocation.heading());
        location.setSource(firstNonBlank(extractedLocation.source(), PROPERTY_REPORT_LOCATION_SOURCE));
        return saveLocationAndProcess(device, location, resolveOccurredAt(message.getTimestamp()));
    }

    /**
     * 获取设备最新位置
     */
    public DeviceLocation getLatestLocation(Long deviceId) {
        Device device = requireOwnedDevice(AppContextHolder.getTenantId(), deviceId);
        return findLatestLocation(device.getTenantId(), device.getId());
    }

    /**
     * 获取设备位置历史
     */
    public IPage<DeviceLocation> getLocationHistory(Long deviceId, DeviceLocationHistoryQueryDTO query) {
        Device device = requireOwnedDevice(AppContextHolder.getTenantId(), deviceId);
        Page<DeviceLocation> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<DeviceLocation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceLocation::getTenantId, device.getTenantId());
        wrapper.eq(DeviceLocation::getDeviceId, device.getId());
        if (query.getStart() != null) wrapper.ge(DeviceLocation::getReportedAt, query.getStart());
        if (query.getEnd() != null) wrapper.le(DeviceLocation::getReportedAt, query.getEnd());
        wrapper.orderByDesc(DeviceLocation::getReportedAt, DeviceLocation::getId);
        return locationMapper.selectPage(page, wrapper);
    }

    /**
     * 获取设备轨迹（按时间正序）
     */
    public List<DeviceLocation> getTrack(Long deviceId, LocalDateTime start, LocalDateTime end, int limit) {
        Device device = requireOwnedDevice(AppContextHolder.getTenantId(), deviceId);
        LambdaQueryWrapper<DeviceLocation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceLocation::getTenantId, device.getTenantId());
        wrapper.eq(DeviceLocation::getDeviceId, device.getId());
        if (start != null) wrapper.ge(DeviceLocation::getReportedAt, start);
        if (end != null) wrapper.le(DeviceLocation::getReportedAt, end);
        wrapper.orderByAsc(DeviceLocation::getReportedAt, DeviceLocation::getId);
        wrapper.last("LIMIT " + Math.min(limit, 10000));
        return locationMapper.selectList(wrapper);
    }

    private DeviceLocation saveLocationAndProcess(Device device, DeviceLocation currentLocation, LocalDateTime reportedAt) {
        DeviceLocation previousLocation = findLatestLocation(device.getTenantId(), device.getId());
        currentLocation.setTenantId(device.getTenantId());
        currentLocation.setDeviceId(device.getId());
        currentLocation.setSource(firstNonBlank(currentLocation.getSource(), DEFAULT_LOCATION_SOURCE));
        currentLocation.setReportedAt(reportedAt != null ? reportedAt : LocalDateTime.now());
        currentLocation.setCreatedAt(LocalDateTime.now());
        locationMapper.insert(currentLocation);
        processGeoFenceTransitions(device, previousLocation, currentLocation);
        return currentLocation;
    }

    private DeviceLocation findLatestLocation(Long tenantId, Long deviceId) {
        return locationMapper.selectOne(new LambdaQueryWrapper<DeviceLocation>()
                .eq(DeviceLocation::getTenantId, tenantId)
                .eq(DeviceLocation::getDeviceId, deviceId)
                .orderByDesc(DeviceLocation::getReportedAt, DeviceLocation::getId)
                .last("LIMIT 1"));
    }

    /**
     * 围栏运行时只在状态发生变化时发出事件，避免每次定位上报都重复噪声触发。
     */
    private void processGeoFenceTransitions(Device device,
                                            DeviceLocation previousLocation,
                                            DeviceLocation currentLocation) {
        if (device == null || previousLocation == null || currentLocation == null) {
            return;
        }
        try {
            List<GeoFence> fences = geoFenceService.listEnabled(device.getTenantId());
            for (GeoFence fence : fences) {
                TransitionType transitionType = detectTransition(fence, previousLocation, currentLocation);
                if (transitionType == null || !matchesTriggerType(fence.getTriggerType(), transitionType)) {
                    continue;
                }
                DeviceMessage eventMessage = buildGeoFenceEventMessage(device, fence, currentLocation, transitionType);
                try {
                    deviceDataService.writeEventFromMessage(eventMessage);
                } catch (Exception ex) {
                    log.error("Failed to persist geofence event: fenceId={}, deviceId={}, transition={}, error={}",
                            fence.getId(), device.getId(), transitionType, ex.getMessage());
                }
                try {
                    messageProducer.publishToTopic(KafkaTopics.RULE_ENGINE_INPUT, eventMessage);
                } catch (Exception ex) {
                    log.error("Failed to publish geofence event to rule engine: fenceId={}, deviceId={}, transition={}, error={}",
                            fence.getId(), device.getId(), transitionType, ex.getMessage());
                }
                log.info("GeoFence transition triggered: fenceId={}, deviceId={}, transition={}, lng={}, lat={}",
                        fence.getId(), device.getId(), transitionType, currentLocation.getLng(), currentLocation.getLat());
            }
        } catch (Exception e) {
            log.error("GeoFence check failed: deviceId={}, error={}", device.getId(), e.getMessage(), e);
        }
    }

    private TransitionType detectTransition(GeoFence fence,
                                            DeviceLocation previousLocation,
                                            DeviceLocation currentLocation) {
        if (fence == null || previousLocation == null || currentLocation == null) {
            return null;
        }
        boolean previousInside = geoFenceService.isInside(fence, previousLocation.getLng(), previousLocation.getLat());
        boolean currentInside = geoFenceService.isInside(fence, currentLocation.getLng(), currentLocation.getLat());
        if (!previousInside && currentInside) {
            return TransitionType.ENTER;
        }
        if (previousInside && !currentInside) {
            return TransitionType.LEAVE;
        }
        return null;
    }

    private boolean matchesTriggerType(String triggerType, TransitionType transitionType) {
        String normalizedTriggerType = firstNonBlank(triggerType, "BOTH");
        return switch (normalizedTriggerType) {
            case "ENTER" -> transitionType == TransitionType.ENTER;
            case "LEAVE" -> transitionType == TransitionType.LEAVE;
            default -> true;
        };
    }

    private DeviceMessage buildGeoFenceEventMessage(Device device,
                                                    GeoFence fence,
                                                    DeviceLocation currentLocation,
                                                    TransitionType transitionType) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("eventType", GEOFENCE_EVENT_TYPE);
        payload.put("eventName", transitionType == TransitionType.ENTER ? "围栏进入" : "围栏离开");
        payload.put("eventLevel", EventLevel.WARNING.name());
        payload.put("fenceId", fence.getId());
        payload.put("fenceName", fence.getName());
        payload.put("transition", transitionType == TransitionType.ENTER ? "0" : "1");
        payload.put("transitionCode", transitionType.name());
        payload.put("transitionLabel", transitionType == TransitionType.ENTER ? "进入" : "离开");
        payload.put("longitude", currentLocation.getLng());
        payload.put("latitude", currentLocation.getLat());
        payload.put("timestamp", currentLocation.getReportedAt() == null ? null : currentLocation.getReportedAt().toString());

        return DeviceMessage.builder()
                .tenantId(device.getTenantId())
                .productId(device.getProductId())
                .deviceId(device.getId())
                .deviceName(device.getDeviceName())
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .topic(GEOFENCE_RULE_TOPIC)
                .payload(payload)
                .timestamp(toEpochMillis(currentLocation.getReportedAt()))
                .build();
    }

    private ExtractedLocation extractLocation(Map<String, Object> payload) {
        Double lng = readDouble(payload, "longitude", "lng");
        Double lat = readDouble(payload, "latitude", "lat");
        if (lng == null || lat == null) {
            return null;
        }
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            log.warn("Skip invalid location payload because coordinates are out of range: lng={}, lat={}", lng, lat);
            return null;
        }
        return new ExtractedLocation(
                lng,
                lat,
                readDouble(payload, "altitude", "alt"),
                readDouble(payload, "speed"),
                readDouble(payload, "heading", "bearing"),
                readString(payload, "locationSource", "source")
        );
    }

    private Double readDouble(Map<String, Object> payload, String... keys) {
        if (payload == null) {
            return null;
        }
        for (String key : keys) {
            Object value = payload.get(key);
            if (value instanceof Number number) {
                return number.doubleValue();
            }
            if (value instanceof String text && !text.isBlank()) {
                try {
                    return Double.parseDouble(text.trim());
                } catch (NumberFormatException ignored) {
                    // Try the next candidate key.
                }
            }
        }
        return null;
    }

    private String readString(Map<String, Object> payload, String... keys) {
        if (payload == null) {
            return null;
        }
        for (String key : keys) {
            Object value = payload.get(key);
            if (value instanceof String text && !text.isBlank()) {
                return text.trim();
            }
        }
        return null;
    }

    private Device requireOwnedDevice(Long tenantId, Long deviceId) {
        Device device = deviceMapper.selectByIdIgnoreTenant(deviceId);
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        if (tenantId != null && device.getTenantId() != null && !Objects.equals(tenantId, device.getTenantId())) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value.trim();
            }
        }
        return null;
    }

    private LocalDateTime resolveOccurredAt(long timestamp) {
        if (timestamp <= 0) {
            return LocalDateTime.now();
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(timestamp), ZoneId.systemDefault());
    }

    private long toEpochMillis(LocalDateTime time) {
        if (time == null) {
            return System.currentTimeMillis();
        }
        return time.atZone(ZoneId.systemDefault()).toInstant().toEpochMilli();
    }

    private enum TransitionType {
        ENTER,
        LEAVE
    }

    private record ExtractedLocation(Double lng,
                                     Double lat,
                                     Double altitude,
                                     Double speed,
                                     Double heading,
                                     String source) {
    }
}
