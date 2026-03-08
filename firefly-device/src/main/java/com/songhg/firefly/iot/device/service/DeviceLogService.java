package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogQueryParam;
import com.songhg.firefly.iot.device.entity.DeviceLog;
import com.songhg.firefly.iot.device.mapper.DeviceLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceLogService {

    private final DeviceLogMapper deviceLogMapper;

    /**
     * 记录设备日志
     */
    @Transactional
    public DeviceLog record(DeviceLog deviceLog) {
        if (deviceLog.getLevel() == null) {
            deviceLog.setLevel("INFO");
        }
        deviceLog.setReportedAt(LocalDateTime.now());
        deviceLog.setCreatedAt(LocalDateTime.now());
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
    public IPage<DeviceLog> listLogs(DeviceLogQueryParam param) {
        Long tenantId = TenantContextHolder.getTenantId();
        Page<DeviceLog> page = new Page<>(param.getPageNum(), param.getPageSize());
        LambdaQueryWrapper<DeviceLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceLog::getTenantId, tenantId);
        if (param.getDeviceId() != null) wrapper.eq(DeviceLog::getDeviceId, param.getDeviceId());
        if (param.getProductId() != null) wrapper.eq(DeviceLog::getProductId, param.getProductId());
        if (param.getLevel() != null && !param.getLevel().isBlank()) wrapper.eq(DeviceLog::getLevel, param.getLevel());
        if (param.getModule() != null && !param.getModule().isBlank()) wrapper.eq(DeviceLog::getModule, param.getModule());
        if (param.getKeyword() != null && !param.getKeyword().isBlank()) wrapper.like(DeviceLog::getContent, param.getKeyword());
        if (param.getStart() != null) wrapper.ge(DeviceLog::getReportedAt, param.getStart());
        if (param.getEnd() != null) wrapper.le(DeviceLog::getReportedAt, param.getEnd());
        wrapper.orderByDesc(DeviceLog::getReportedAt);
        return deviceLogMapper.selectPage(page, wrapper);
    }

    /**
     * 获取设备最近日志
     */
    public List<DeviceLog> getRecentLogs(Long deviceId, int limit) {
        return deviceLogMapper.selectList(new LambdaQueryWrapper<DeviceLog>()
                .eq(DeviceLog::getDeviceId, deviceId)
                .orderByDesc(DeviceLog::getReportedAt)
                .last("LIMIT " + Math.min(limit, 500)));
    }

    /**
     * 统计各级别日志数量
     */
    public long countByLevel(Long deviceId, String level) {
        LambdaQueryWrapper<DeviceLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DeviceLog::getDeviceId, deviceId);
        if (level != null) wrapper.eq(DeviceLog::getLevel, level);
        return deviceLogMapper.selectCount(wrapper);
    }

    /**
     * 清理过期日志（默认30天）
     */
    @Transactional
    public int cleanExpiredLogs(int days) {
        LocalDateTime threshold = LocalDateTime.now().minusDays(days);
        int deleted = deviceLogMapper.delete(new LambdaQueryWrapper<DeviceLog>()
                .lt(DeviceLog::getCreatedAt, threshold));
        if (deleted > 0) log.info("Cleaned {} expired device logs (older than {} days)", deleted, days);
        return deleted;
    }
}
