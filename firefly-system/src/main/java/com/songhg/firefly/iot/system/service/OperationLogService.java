package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.system.dto.operationlog.OperationLogQueryDTO;
import com.songhg.firefly.iot.system.entity.OperationLog;
import com.songhg.firefly.iot.system.mapper.OperationLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class OperationLogService {

    private final OperationLogMapper operationLogMapper;

    @Async
    @Transactional
    public void recordAsync(OperationLog operLog) {
        if (operLog.getCreatedAt() == null) operLog.setCreatedAt(LocalDateTime.now());
        operationLogMapper.insert(operLog);
    }

    @Transactional
    public void record(OperationLog operLog) {
        if (operLog.getCreatedAt() == null) operLog.setCreatedAt(LocalDateTime.now());
        operationLogMapper.insert(operLog);
    }

    public IPage<OperationLog> list(OperationLogQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
        Page<OperationLog> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<OperationLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OperationLog::getTenantId, tenantId);
        if (query.getModule() != null && !query.getModule().isBlank()) wrapper.eq(OperationLog::getModule, query.getModule());
        if (query.getOperationType() != null && !query.getOperationType().isBlank()) wrapper.eq(OperationLog::getOperationType, query.getOperationType());
        if (query.getUsername() != null && !query.getUsername().isBlank()) wrapper.like(OperationLog::getUsername, query.getUsername());
        if (query.getStatus() != null) wrapper.eq(OperationLog::getStatus, query.getStatus());
        if (query.getStart() != null) wrapper.ge(OperationLog::getCreatedAt, query.getStart());
        if (query.getEnd() != null) wrapper.le(OperationLog::getCreatedAt, query.getEnd());
        wrapper.orderByDesc(OperationLog::getCreatedAt);
        return operationLogMapper.selectPage(page, wrapper);
    }

    public OperationLog getById(Long id) {
        return operationLogMapper.selectById(id);
    }

    @Transactional
    public int cleanExpired(int days) {
        LocalDateTime threshold = LocalDateTime.now().minusDays(days);
        int deleted = operationLogMapper.delete(new LambdaQueryWrapper<OperationLog>()
                .lt(OperationLog::getCreatedAt, threshold));
        if (deleted > 0) log.info("Cleaned {} expired operation logs (older than {} days)", deleted, days);
        return deleted;
    }
}
