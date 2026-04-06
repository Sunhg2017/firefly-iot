package com.songhg.firefly.iot.system.aspect;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.system.annotation.OperLog;
import com.songhg.firefly.iot.system.entity.OperationLog;
import com.songhg.firefly.iot.system.service.OperationLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import io.swagger.v3.oas.annotations.Hidden;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.util.StringUtils;
import org.springframework.validation.BindingResult;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.context.request.RequestContextHolder;
import org.springframework.web.context.request.ServletRequestAttributes;

import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Slf4j
@Aspect
@Component
@RequiredArgsConstructor
public class OperLogAspect {

    private static final Set<String> SKIPPED_CONTROLLERS = Set.of(
            "OperationLogController",
            "AuditLogController",
            "LoginLogController"
    );

    private final OperationLogService operationLogService;
    private final ObjectMapper objectMapper;

    @Around("execution(public * com.songhg.firefly.iot.system.controller..*(..))")
    public Object around(ProceedingJoinPoint joinPoint) throws Throwable {
        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        Class<?> controllerClass = signature.getDeclaringType();
        OperLog annotation = AnnotatedElementUtils.findMergedAnnotation(method, OperLog.class);

        if (shouldSkip(controllerClass, method)) {
            return joinPoint.proceed();
        }

        long startTime = System.currentTimeMillis();
        OperationLog operLog = new OperationLog();

        operLog.setModule(resolveModule(controllerClass, annotation));
        operLog.setOperationType(resolveOperationType(method, annotation));
        operLog.setDescription(resolveDescription(method, annotation));
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
            operLog.setUsername(resolveUsername(request));
        } else {
            operLog.setUsername(AppContextHolder.getUsername());
        }

        try {
            String params = serializeArgs(joinPoint.getArgs());
            if (params != null) {
                operLog.setRequestParams(truncate(params, 2000));
            }
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

    boolean shouldSkip(Class<?> controllerClass, Method method) {
        if (controllerClass == null || method == null) {
            return true;
        }
        if (SKIPPED_CONTROLLERS.contains(controllerClass.getSimpleName())) {
            return true;
        }
        if (AnnotatedElementUtils.findMergedAnnotation(controllerClass, Hidden.class) != null) {
            return true;
        }
        return AnnotatedElementUtils.findMergedAnnotation(method, Hidden.class) != null;
    }

    String resolveModule(Class<?> controllerClass, OperLog annotation) {
        if (annotation != null && StringUtils.hasText(annotation.module())) {
            return annotation.module().trim();
        }
        Tag tag = AnnotatedElementUtils.findMergedAnnotation(controllerClass, Tag.class);
        if (tag != null && StringUtils.hasText(tag.name())) {
            return tag.name().trim();
        }
        String simpleName = controllerClass.getSimpleName();
        return simpleName.endsWith("Controller")
                ? simpleName.substring(0, simpleName.length() - "Controller".length())
                : simpleName;
    }

    String resolveDescription(Method method, OperLog annotation) {
        if (annotation != null && StringUtils.hasText(annotation.description())) {
            return annotation.description().trim();
        }
        Operation operation = AnnotatedElementUtils.findMergedAnnotation(method, Operation.class);
        if (operation != null && StringUtils.hasText(operation.summary())) {
            return operation.summary().trim();
        }
        return method.getName();
    }

    String resolveOperationType(Method method, OperLog annotation) {
        if (annotation != null && StringUtils.hasText(annotation.operationType())) {
            return annotation.operationType().trim().toUpperCase(Locale.ROOT);
        }

        String description = resolveDescription(method, annotation);
        String fromDescription = resolveOperationTypeFromDescription(description);
        if (fromDescription != null) {
            return fromDescription;
        }

        ServletRequestAttributes attributes = (ServletRequestAttributes) RequestContextHolder.getRequestAttributes();
        if (attributes == null) {
            return "UPDATE";
        }
        return resolveOperationTypeFromRequest(attributes.getRequest().getMethod(), attributes.getRequest().getRequestURI());
    }

    String resolveOperationTypeFromDescription(String description) {
        String normalized = normalize(description);
        if (!StringUtils.hasText(normalized)) {
            return null;
        }
        if (containsAny(normalized, "logout", "登出", "退出")) {
            return "LOGOUT";
        }
        if (containsAny(normalized, "login", "登录")) {
            return "LOGIN";
        }
        if (containsAny(normalized, "export", "导出")) {
            return "EXPORT";
        }
        if (containsAny(normalized, "delete", "remove", "clean", "删除", "移除", "清理")) {
            return "DELETE";
        }
        if (containsAny(normalized, "update", "reset", "assign", "toggle", "enable", "disable", "deactivate", "bind",
                "sync", "authorize", "approve", "reject", "revoke", "kick", "refresh", "change", "修改", "更新",
                "重置", "分配", "启用", "停用", "禁用", "同步", "授权", "审批", "驳回", "撤销", "踢下线", "刷新")) {
            return "UPDATE";
        }
        if (containsAny(normalized, "create", "add", "send", "upload", "import", "创建", "新增", "发送", "上传", "导入")) {
            return "CREATE";
        }
        if (containsAny(normalized, "list", "query", "get", "detail", "page", "分页", "查询", "获取", "查看", "详情", "概览", "统计")) {
            return "QUERY";
        }
        return null;
    }

    String resolveOperationTypeFromRequest(String requestMethod, String requestUri) {
        String method = normalize(requestMethod);
        String uri = normalize(requestUri);
        if (containsAny(uri, "/logout")) {
            return "LOGOUT";
        }
        if (containsAny(uri, "/login")) {
            return "LOGIN";
        }
        if (containsAny(uri, "/export")) {
            return "EXPORT";
        }
        if ("delete".equals(method) || containsAny(uri, "/clean")) {
            return "DELETE";
        }
        if ("put".equals(method) || "patch".equals(method)) {
            return "UPDATE";
        }
        if ("get".equals(method) || containsAny(uri, "/list", "/query", "/logs", "/stats", "/options", "/overview")) {
            return "QUERY";
        }
        return "CREATE";
    }

    private String resolveUsername(HttpServletRequest request) {
        String usernameHeader = request.getHeader("X-User-Name");
        if (StringUtils.hasText(usernameHeader)) {
            return usernameHeader.trim();
        }
        return AppContextHolder.getUsername();
    }

    private String serializeArgs(Object[] args) throws Exception {
        List<Object> serializableArgs = new ArrayList<>();
        for (Object arg : args) {
            if (arg == null
                    || arg instanceof HttpServletRequest
                    || arg instanceof HttpServletResponse
                    || arg instanceof BindingResult
                    || arg instanceof MultipartFile
                    || arg instanceof MultipartFile[]) {
                continue;
            }
            serializableArgs.add(arg);
        }
        if (serializableArgs.isEmpty()) {
            return null;
        }
        Object payload = serializableArgs.size() == 1 ? serializableArgs.get(0) : serializableArgs;
        return objectMapper.writeValueAsString(payload);
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

    private boolean containsAny(String text, String... keywords) {
        if (!StringUtils.hasText(text)) {
            return false;
        }
        for (String keyword : keywords) {
            if (text.contains(normalize(keyword))) {
                return true;
            }
        }
        return false;
    }

    private String normalize(String text) {
        if (!StringUtils.hasText(text)) {
            return "";
        }
        return text.trim().toLowerCase(Locale.ROOT);
    }
}
