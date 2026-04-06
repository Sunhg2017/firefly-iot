package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.device.convert.DeviceLogConvert;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogQueryParam;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogVO;
import com.songhg.firefly.iot.device.entity.DeviceLog;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceLogService {

    private static final String DEFAULT_LEVEL = "INFO";
    private static final int DEFAULT_RECENT_LIMIT = 100;
    private static final int MAX_RECENT_LIMIT = 500;
    private static final int DEFAULT_RETENTION_DAYS = 30;

    private final DeviceLogMapper deviceLogMapper;
    private final DeviceMapper deviceMapper;

    /**
     * 记录设备日志
     */
    @Transactional
    public DeviceLog record(DeviceLog deviceLog) {
        LocalDateTime now = LocalDateTime.now();
        deviceLog.setLevel(normalizeRequiredLevel(deviceLog.getLevel()));
        if (deviceLog.getReportedAt() == null) {
            deviceLog.setReportedAt(now);
        }
        deviceLog.setCreatedAt(now);
        deviceLogMapper.insert(deviceLog);
        return deviceLog;
    }

    /**
     * 异步记录设备日志
     */
    @Async
    public void recordAsync(DeviceLog deviceLog) {
        try {
            record(deviceLog);
        } catch (Exception e) {
            log.error("Failed to record device log: deviceId={}, error={}", deviceLog.getDeviceId(), e.getMessage());
        }
    }

    /**
     * 分页查询设备日志
     */
    public IPage<DeviceLogVO> listLogs(DeviceLogQueryParam param) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<DeviceLog> page = new Page<>(param.getPageNum(), param.getPageSize());
        LambdaQueryWrapper<DeviceLog> wrapper = new LambdaQueryWrapper<>();
        if (tenantId != null) {
            wrapper.eq(DeviceLog::getTenantId, tenantId);
        }
        if (param.getDeviceId() != null) wrapper.eq(DeviceLog::getDeviceId, param.getDeviceId());
        if (param.getProductId() != null) wrapper.eq(DeviceLog::getProductId, param.getProductId());
        String normalizedLevel = normalizeOptionalLevel(param.getLevel());
        if (normalizedLevel != null) wrapper.eq(DeviceLog::getLevel, normalizedLevel);
        if (param.getModule() != null && !param.getModule().isBlank()) wrapper.eq(DeviceLog::getModule, param.getModule());
        if (param.getKeyword() != null && !param.getKeyword().isBlank()) wrapper.like(DeviceLog::getContent, param.getKeyword());
        if (param.getStart() != null) wrapper.ge(DeviceLog::getReportedAt, param.getStart());
        if (param.getEnd() != null) wrapper.le(DeviceLog::getReportedAt, param.getEnd());
        wrapper.orderByDesc(DeviceLog::getReportedAt);
        IPage<DeviceLog> logPage = deviceLogMapper.selectPage(page, wrapper);
        Map<Long, DeviceBasicVO> deviceBasicMap = loadDeviceBasicMap(logPage.getRecords(), tenantId);
        return logPage.convert(logRecord -> buildLogView(logRecord, deviceBasicMap));
    }

    /**
     * 获取设备最近日志
     */
    public List<DeviceLogVO> getRecentLogs(Long deviceId, int limit) {
        Long tenantId = AppContextHolder.getTenantId();
        List<DeviceLog> records = deviceLogMapper.selectList(new LambdaQueryWrapper<DeviceLog>()
                .eq(tenantId != null, DeviceLog::getTenantId, tenantId)
                .eq(DeviceLog::getDeviceId, deviceId)
                .orderByDesc(DeviceLog::getReportedAt)
                .last("LIMIT " + sanitizeRecentLimit(limit)));
        Map<Long, DeviceBasicVO> deviceBasicMap = loadDeviceBasicMap(records, tenantId);
        return records.stream()
                .map(record -> buildLogView(record, deviceBasicMap))
                .toList();
    }

    /**
     * 统计各级别日志数量
     */
    public long countByLevel(Long deviceId, String level) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<DeviceLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(tenantId != null, DeviceLog::getTenantId, tenantId);
        wrapper.eq(DeviceLog::getDeviceId, deviceId);
        String normalizedLevel = normalizeOptionalLevel(level);
        if (normalizedLevel != null) wrapper.eq(DeviceLog::getLevel, normalizedLevel);
        return deviceLogMapper.selectCount(wrapper);
    }

    /**
     * 清理过期日志（默认30天）
     */
    @Transactional
    public int cleanExpiredLogs(int days) {
        Long tenantId = AppContextHolder.getTenantId();
        int retentionDays = days > 0 ? days : DEFAULT_RETENTION_DAYS;
        LocalDateTime threshold = LocalDateTime.now().minusDays(retentionDays);
        int deleted = deviceLogMapper.delete(new LambdaQueryWrapper<DeviceLog>()
                .eq(tenantId != null, DeviceLog::getTenantId, tenantId)
                .lt(DeviceLog::getCreatedAt, threshold));
        if (deleted > 0) log.info("Cleaned {} expired device logs (older than {} days) for tenant={}", deleted, retentionDays, tenantId);
        return deleted;
    }

    /**
     * 设备日志页面需要用设备名称、产品 Key 作为主视角，避免用户只能靠数据库主键阅读日志。
     * 当前页日志按 deviceId 批量补齐设备基础信息，既保证展示可读，也避免逐条回表。
     */
    private Map<Long, DeviceBasicVO> loadDeviceBasicMap(List<DeviceLog> records, Long tenantId) {
        Set<Long> deviceIds = records.stream()
                .map(DeviceLog::getDeviceId)
                .filter(Objects::nonNull)
                .collect(Collectors.toSet());
        if (deviceIds.isEmpty()) {
            return Map.of();
        }
        return deviceMapper.selectBasicByIdsIgnoreTenant(List.copyOf(deviceIds)).stream()
                .filter(item -> tenantId == null || Objects.equals(item.getTenantId(), tenantId))
                .filter(item -> item.getId() != null)
                .collect(Collectors.toMap(DeviceBasicVO::getId, item -> item, (left, right) -> left, LinkedHashMap::new));
    }

    private DeviceLogVO buildLogView(DeviceLog entity, Map<Long, DeviceBasicVO> deviceBasicMap) {
        DeviceLogVO view = DeviceLogConvert.INSTANCE.toVO(entity);
        DeviceBasicVO deviceBasic = deviceBasicMap.get(entity.getDeviceId());
        if (deviceBasic == null) {
            return view;
        }
        view.setDeviceName(deviceBasic.getDeviceName());
        view.setNickname(deviceBasic.getNickname());
        view.setProductKey(deviceBasic.getProductKey());
        view.setProductName(deviceBasic.getProductName());
        return view;
    }

    private String normalizeRequiredLevel(String level) {
        String normalized = normalizeOptionalLevel(level);
        return normalized != null ? normalized : DEFAULT_LEVEL;
    }

    private String normalizeOptionalLevel(String level) {
        if (level == null || level.isBlank()) {
            return null;
        }
        return level.trim().toUpperCase();
    }

    private int sanitizeRecentLimit(int limit) {
        if (limit <= 0) {
            return DEFAULT_RECENT_LIMIT;
        }
        return Math.min(limit, MAX_RECENT_LIMIT);
    }
}
