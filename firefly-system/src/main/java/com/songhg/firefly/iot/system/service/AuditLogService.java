package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.AuditAction;
import com.songhg.firefly.iot.common.enums.AuditModule;
import com.songhg.firefly.iot.system.convert.AuditLogConvert;
import com.songhg.firefly.iot.system.dto.audit.AuditLogQueryDTO;
import com.songhg.firefly.iot.system.dto.audit.AuditLogVO;
import com.songhg.firefly.iot.system.entity.AuditLog;
import com.songhg.firefly.iot.system.mapper.AuditLogMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class AuditLogService {

    private final AuditLogMapper auditLogMapper;

    /**
     * 异步记录审计日志
     */
    @Async
    public void record(AuditLog auditLog) {
        try {
            if (auditLog.getCreatedAt() == null) {
                auditLog.setCreatedAt(LocalDateTime.now());
            }
            auditLogMapper.insert(auditLog);
        } catch (Exception e) {
            log.error("Failed to record audit log: {}", e.getMessage());
        }
    }

    /**
     * 便捷记录方法
     */
    public void record(Long tenantId, Long userId, String username,
                       AuditModule module, AuditAction action, String description,
                       String targetType, String targetId,
                       String requestMethod, String requestUrl,
                       String clientIp, String userAgent,
                       String responseStatus, Long duration, String errorMessage) {
        AuditLog auditLog = new AuditLog();
        auditLog.setTenantId(tenantId);
        auditLog.setUserId(userId);
        auditLog.setUsername(username);
        auditLog.setModule(module);
        auditLog.setAction(action);
        auditLog.setDescription(description);
        auditLog.setTargetType(targetType);
        auditLog.setTargetId(targetId);
        auditLog.setRequestMethod(requestMethod);
        auditLog.setRequestUrl(requestUrl);
        auditLog.setClientIp(clientIp);
        auditLog.setUserAgent(userAgent);
        auditLog.setResponseStatus(responseStatus);
        auditLog.setDuration(duration);
        auditLog.setErrorMessage(errorMessage);
        auditLog.setCreatedAt(LocalDateTime.now());
        record(auditLog);
    }

    /**
     * 分页查询审计日志
     */
    public IPage<AuditLogVO> listAuditLogs(AuditLogQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<AuditLog> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<AuditLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AuditLog::getTenantId, tenantId);

        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(AuditLog::getUsername, query.getKeyword())
                    .or().like(AuditLog::getDescription, query.getKeyword())
                    .or().like(AuditLog::getRequestUrl, query.getKeyword()));
        }
        if (query.getModule() != null) {
            wrapper.eq(AuditLog::getModule, query.getModule());
        }
        if (query.getAction() != null) {
            wrapper.eq(AuditLog::getAction, query.getAction());
        }
        if (query.getUserId() != null) {
            wrapper.eq(AuditLog::getUserId, query.getUserId());
        }
        if (query.getResponseStatus() != null) {
            wrapper.eq(AuditLog::getResponseStatus, query.getResponseStatus());
        }
        if (query.getStartTime() != null) {
            wrapper.ge(AuditLog::getCreatedAt, query.getStartTime());
        }
        if (query.getEndTime() != null) {
            wrapper.le(AuditLog::getCreatedAt, query.getEndTime());
        }
        wrapper.orderByDesc(AuditLog::getCreatedAt);

        IPage<AuditLog> result = auditLogMapper.selectPage(page, wrapper);
        return result.convert(AuditLogConvert.INSTANCE::toVO);
    }

    /**
     * 获取审计日志详情
     */
    public AuditLogVO getById(Long id) {
        AuditLog auditLog = auditLogMapper.selectById(id);
        return auditLog != null ? AuditLogConvert.INSTANCE.toVO(auditLog) : null;
    }
}
