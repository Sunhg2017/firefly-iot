package com.songhg.firefly.iot.system.aspect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.audit.Auditable;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.system.entity.AuditLog;
import com.songhg.firefly.iot.system.service.AuditLogService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.time.LocalDateTime;

@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
@ConditionalOnProperty(prefix = "firefly.audit", name = "enabled", havingValue = "true", matchIfMissing = false)
public class AuditLogAspect {

    private final AuditLogService auditLogService;
    private final ObjectMapper objectMapper;

    @Around("@annotation(com.songhg.firefly.iot.common.audit.Auditable)")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        Auditable auditable = method.getAnnotation(Auditable.class);
        if (auditable == null) {
            return joinPoint.proceed();
        }

        long startTime = System.currentTimeMillis();
        AuditLog auditLog = new AuditLog();
        auditLog.setModule(auditable.module());
        auditLog.setAction(auditable.action());
        auditLog.setDescription(auditable.description());
        auditLog.setCreatedAt(LocalDateTime.now());

        try {
            auditLog.setTenantId(TenantContextHolder.getTenantId());
        } catch (Exception ignored) {}
        try {
            auditLog.setUserId(UserContextHolder.getUserId());
        } catch (Exception ignored) {}

        // Extract request info
        ServletRequestAttributes attrs = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attrs != null) {
            HttpServletRequest request = attrs.getRequest();
            auditLog.setRequestMethod(request.getMethod());
            auditLog.setRequestUrl(request.getRequestURI());
            auditLog.setClientIp(getClientIp(request));
            auditLog.setUserAgent(request.getHeader("User-Agent"));
            auditLog.setUsername(request.getHeader("X-User-Name"));

            String queryString = request.getQueryString();
            if (queryString != null && queryString.length() <= 2000) {
                auditLog.setRequestParams(queryString);
            }
        }

        // Extract target info from path variables
        String[] paramNames = signature.getParameterNames();
        Object[] args = joinPoint.getArgs();
        if (paramNames != null) {
            for (int i = 0; i < paramNames.length; i++) {
                if ("id".equals(paramNames[i]) && args[i] != null) {
                    auditLog.setTargetId(String.valueOf(args[i]));
                    auditLog.setTargetType(auditable.module().getCode().toLowerCase());
                    break;
                }
            }
        }

        // Try to serialize request body (first non-primitive arg)
        try {
            for (Object arg : args) {
                if (arg != null && !isPrimitive(arg)) {
                    String body = objectMapper.writeValueAsString(arg);
                    if (body.length() <= 4000) {
                        auditLog.setRequestBody(body);
                    }
                    break;
                }
            }
        } catch (Exception ignored) {}

        Object result;
        try {
            result = joinPoint.proceed();
            auditLog.setResponseStatus("SUCCESS");
        } catch (Throwable e) {
            auditLog.setResponseStatus("FAILED");
            String errMsg = e.getMessage();
            if (errMsg != null && errMsg.length() > 500) {
                errMsg = errMsg.substring(0, 500);
            }
            auditLog.setErrorMessage(errMsg);
            throw e;
        } finally {
            auditLog.setDuration(System.currentTimeMillis() - startTime);
            auditLogService.record(auditLog);
        }

        return result;
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isEmpty() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }

    private boolean isPrimitive(Object obj) {
        return obj instanceof Number || obj instanceof String || obj instanceof Boolean
                || obj instanceof Character || obj.getClass().isPrimitive();
    }
}
