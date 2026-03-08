package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.device.dto.geo.DeviceLocationHistoryQueryDTO;
import com.songhg.firefly.iot.device.entity.DeviceLocation;
import com.songhg.firefly.iot.device.entity.GeoFence;
import com.songhg.firefly.iot.device.mapper.DeviceLocationMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceLocationService {

    private final DeviceLocationMapper locationMapper;
    private final GeoFenceService geoFenceService;

    /**
     * 上报设备位置 + 围栏检测
     */
    @Transactional
    public DeviceLocation reportLocation(DeviceLocation loc) {
        if (loc.getSource() == null) {
            loc.setSource("GPS");
        }
        loc.setReportedAt(LocalDateTime.now());
        loc.setCreatedAt(LocalDateTime.now());
        locationMapper.insert(loc);

        // 围栏检测
        checkGeoFences(loc.getDeviceId(), loc.getLng(), loc.getLat());

        return loc;
    }

    /**
     * 获取设备最新位置
     */
    public DeviceLocation getLatestLocation(Long deviceId) {
        return locationMapper.selectOne(new LambdaQueryWrapper<DeviceLocation>()
                .eq(DeviceLocation::getDeviceId, deviceId)
                .orderByDesc(DeviceLocation::getReportedAt)
                .last("LIMIT 1"));
    }

    /**
     * 获取设备位置历史
     */
    public IPage<DeviceLocation> getLocationHistory(Long deviceId, DeviceLocationHistoryQueryDTO query) {
        Page<DeviceLocation> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<DeviceLocation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceLocation::getDeviceId, deviceId);
        if (query.getStart() != null) wrapper.ge(DeviceLocation::getReportedAt, query.getStart());
        if (query.getEnd() != null) wrapper.le(DeviceLocation::getReportedAt, query.getEnd());
        wrapper.orderByDesc(DeviceLocation::getReportedAt);
        return locationMapper.selectPage(page, wrapper);
    }

    /**
     * 获取设备轨迹（按时间正序）
     */
    public List<DeviceLocation> getTrack(Long deviceId, LocalDateTime start, LocalDateTime end, int limit) {
        LambdaQueryWrapper<DeviceLocation> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceLocation::getDeviceId, deviceId);
        if (start != null) wrapper.ge(DeviceLocation::getReportedAt, start);
        if (end != null) wrapper.le(DeviceLocation::getReportedAt, end);
        wrapper.orderByAsc(DeviceLocation::getReportedAt);
        wrapper.last("LIMIT " + Math.min(limit, 10000));
        return locationMapper.selectList(wrapper);
    }

    /**
     * 围栏检测
     */
    private void checkGeoFences(Long deviceId, double lng, double lat) {
        try {
            List<GeoFence> fences = geoFenceService.listEnabled();
            for (GeoFence fence : fences) {
                boolean inside = geoFenceService.isInside(fence, lng, lat);
                String triggerType = fence.getTriggerType();

                if ("ENTER".equals(triggerType) && inside) {
                    log.warn("GeoFence ENTER triggered: fenceId={}, deviceId={}, lng={}, lat={}", fence.getId(), deviceId, lng, lat);
                } else if ("LEAVE".equals(triggerType) && !inside) {
                    log.warn("GeoFence LEAVE triggered: fenceId={}, deviceId={}, lng={}, lat={}", fence.getId(), deviceId, lng, lat);
                } else if ("BOTH".equals(triggerType)) {
                    log.info("GeoFence check: fenceId={}, deviceId={}, inside={}", fence.getId(), deviceId, inside);
                }
            }
        } catch (Exception e) {
            log.error("GeoFence check failed: deviceId={}, error={}", deviceId, e.getMessage());
        }
    }
}
