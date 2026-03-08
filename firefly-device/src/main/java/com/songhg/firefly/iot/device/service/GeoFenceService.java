package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceQueryDTO;
import com.songhg.firefly.iot.device.entity.GeoFence;
import com.songhg.firefly.iot.device.mapper.GeoFenceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class GeoFenceService {

    private final GeoFenceMapper fenceMapper;

    @Transactional
    public GeoFence createFence(GeoFence fence) {
        fence.setTenantId(TenantContextHolder.getTenantId());
        fence.setCreatedBy(UserContextHolder.getUserId());
        if (fence.getEnabled() == null) fence.setEnabled(true);
        fenceMapper.insert(fence);
        log.info("GeoFence created: id={}, name={}, type={}", fence.getId(), fence.getName(), fence.getFenceType());
        return fence;
    }

    public GeoFence getFence(Long id) {
        GeoFence fence = fenceMapper.selectById(id);
        if (fence == null) throw new BizException(ResultCode.PARAM_ERROR, "围栏不存在");
        return fence;
    }

    public IPage<GeoFence> listFences(GeoFenceQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
        Page<GeoFence> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<GeoFence> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(GeoFence::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(GeoFence::getName, query.getKeyword());
        }
        if (query.getFenceType() != null && !query.getFenceType().isBlank()) {
            wrapper.eq(GeoFence::getFenceType, query.getFenceType());
        }
        if (query.getEnabled() != null) {
            wrapper.eq(GeoFence::getEnabled, query.getEnabled());
        }
        wrapper.orderByDesc(GeoFence::getCreatedAt);
        return fenceMapper.selectPage(page, wrapper);
    }

    public List<GeoFence> listEnabled() {
        Long tenantId = TenantContextHolder.getTenantId();
        return fenceMapper.selectList(new LambdaQueryWrapper<GeoFence>()
                .eq(GeoFence::getTenantId, tenantId)
                .eq(GeoFence::getEnabled, true));
    }

    @Transactional
    public GeoFence updateFence(Long id, GeoFence update) {
        GeoFence fence = getFence(id);
        if (update.getName() != null) fence.setName(update.getName());
        if (update.getDescription() != null) fence.setDescription(update.getDescription());
        if (update.getCoordinates() != null) fence.setCoordinates(update.getCoordinates());
        if (update.getCenterLng() != null) fence.setCenterLng(update.getCenterLng());
        if (update.getCenterLat() != null) fence.setCenterLat(update.getCenterLat());
        if (update.getRadius() != null) fence.setRadius(update.getRadius());
        if (update.getTriggerType() != null) fence.setTriggerType(update.getTriggerType());
        if (update.getEnabled() != null) fence.setEnabled(update.getEnabled());
        fenceMapper.updateById(fence);
        return fence;
    }

    @Transactional
    public void deleteFence(Long id) {
        fenceMapper.deleteById(id);
        log.info("GeoFence deleted: id={}", id);
    }

    @Transactional
    public void toggleEnabled(Long id, boolean enabled) {
        GeoFence fence = getFence(id);
        fence.setEnabled(enabled);
        fenceMapper.updateById(fence);
    }

    /**
     * 检测设备坐标是否在围栏内（圆形围栏）
     */
    public boolean isInsideCircleFence(GeoFence fence, double lng, double lat) {
        if (fence.getCenterLng() == null || fence.getCenterLat() == null || fence.getRadius() == null) return false;
        double distance = haversineDistance(fence.getCenterLat(), fence.getCenterLng(), lat, lng);
        return distance <= fence.getRadius();
    }

    /**
     * 检测设备坐标是否在围栏内（多边形围栏 — 射线法）
     */
    public boolean isInsidePolygonFence(GeoFence fence, double lng, double lat) {
        String coords = fence.getCoordinates();
        if (coords == null || coords.isBlank()) return false;
        try {
            String[] points = coords.split(";");
            int n = points.length;
            boolean inside = false;
            for (int i = 0, j = n - 1; i < n; j = i++) {
                String[] pi = points[i].split(",");
                String[] pj = points[j].split(",");
                double xi = Double.parseDouble(pi[0]), yi = Double.parseDouble(pi[1]);
                double xj = Double.parseDouble(pj[0]), yj = Double.parseDouble(pj[1]);
                if ((yi > lat) != (yj > lat) && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
                    inside = !inside;
                }
            }
            return inside;
        } catch (Exception e) {
            log.error("Failed to check polygon fence: {}", e.getMessage());
            return false;
        }
    }

    /**
     * 检测设备是否在围栏内
     */
    public boolean isInside(GeoFence fence, double lng, double lat) {
        if ("CIRCLE".equals(fence.getFenceType())) {
            return isInsideCircleFence(fence, lng, lat);
        } else if ("POLYGON".equals(fence.getFenceType())) {
            return isInsidePolygonFence(fence, lng, lat);
        }
        return false;
    }

    /**
     * Haversine 距离计算（单位：米）
     */
    private double haversineDistance(double lat1, double lng1, double lat2, double lng2) {
        double R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2)) *
                        Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}
