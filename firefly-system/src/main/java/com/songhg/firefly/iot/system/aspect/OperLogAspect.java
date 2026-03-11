package com.songhg.firefly.iot.system.aspect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.system.annotation.OperLog;
import com.songhg.firefly.iot.system.entity.OperationLog;
import com.songhg.firefly.iot.system.service.OperationLogService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.stereotype.Component;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;

@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class OperLogAspect {

    private final OperationLogService operationLogService;
    private final ObjectMapper objectMapper;

    @Around("@annotation(com.songhg.firefly.iot.system.annotation.OperLog)")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        long startTime = System.currentTimeMillis();
        OperationLog operLog = new OperationLog();

        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        OperLog annotation = method.getAnnotation(OperLog.class);

        operLog.setModule(annotation.module());
        operLog.setOperationType(annotation.operationType());
        operLog.setDescription(annotation.description());
        operLog.setMethod(signature.getDeclaringTypeName() + "." + method.getName());

        try {
            operLog.setTenantId(AppContextHolder.getTenantId());
        } catch (Exception ignored) {}
        try {
            operLog.setUserId(AppContextHolder.getUserId());
        } catch (Exception ignored) {}

        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes != null) {
            HttpServletRequest request = attributes.getRequest();
            operLog.setRequestUrl(request.getRequestURI());
            operLog.setRequestMethod(request.getMethod());
            operLog.setIp(getClientIp(request));
            operLog.setUserAgent(truncate(request.getHeader("User-Agent"), 500));
            operLog.setUsername(request.getHeader("X-User-Name"));
        }

        try {
            String params = objectMapper.writeValueAsString(joinPoint.getArgs());
            operLog.setRequestParams(truncate(params, 2000));
        } catch (Exception ignored) {}

        Object result;
        try {
            result = joinPoint.proceed();
            operLog.setStatus(0);
            try {
                String resultStr = objectMapper.writeValueAsString(result);
                operLog.setResponseResult(truncate(resultStr, 2000));
            } catch (Exception ignored) {}
        } catch (Throwable e) {
            operLog.setStatus(1);
            operLog.setErrorMsg(truncate(e.getMessage(), 2000));
            throw e;
        } finally {
            operLog.setCostMs(System.currentTimeMillis() - startTime);
            try {
                operationLogService.recordAsync(operLog);
            } catch (Exception e) {
                log.error("Failed to record operation log", e);
            }
        }
        return result;
    }

    private String getClientIp(HttpServletRequest request) {
        String ip = request.getHeader("X-Forwarded-For");
        if (ip == null || ip.isBlank() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getHeader("X-Real-IP");
        }
        if (ip == null || ip.isBlank() || "unknown".equalsIgnoreCase(ip)) {
            ip = request.getRemoteAddr();
        }
        if (ip != null && ip.contains(",")) {
            ip = ip.split(",")[0].trim();
        }
        return ip;
    }

    private String truncate(String str, int maxLen) {
        if (str == null) return null;
        return str.length() > maxLen ? str.substring(0, maxLen) : str;
    }
}
