package com.songhg.firefly.iot.common.context;

import com.songhg.firefly.iot.common.enums.IsolationLevel;
import com.songhg.firefly.iot.common.enums.TenantPlan;

import java.util.Set;

/**
 * 统一上下文持有者，通过单个 ThreadLocal 同时管理租户和用户信息。
 *
 * <pre>
 * 典型用法：
 *   // 设置（拦截器中）
 *   AppContext ctx = new AppContext();
 *   ctx.setTenantId(tenantId);
 *   ctx.setUserId(userId);
 *   AppContextHolder.set(ctx);
 *
 *   // 读取（业务代码中）
 *   Long tenantId = AppContextHolder.getTenantId();
 *   Long userId = AppContextHolder.getUserId();
 *
 *   // 清理（finally 或 afterCompletion 中）
 *   AppContextHolder.clear();
 * </pre>
 */
public final class AppContextHolder {

    private static final ThreadLocal<AppContext> CONTEXT = new ThreadLocal<>();

    private AppContextHolder() {
    }

    // ==================== 基础操作 ====================

    /**
     * 设置完整的应用上下文
     */
    public static void set(AppContext ctx) {
        CONTEXT.set(ctx);
    }

    /**
     * 获取完整的应用上下文
     */
    public static AppContext get() {
        return CONTEXT.get();
    }

    /**
     * 获取当前上下文，如果不存在则创建新的并设置到 ThreadLocal
     */
    public static AppContext getOrCreate() {
        AppContext ctx = CONTEXT.get();
        if (ctx == null) {
            ctx = new AppContext();
            CONTEXT.set(ctx);
        }
        return ctx;
    }

    /**
     * 清理上下文（应在 finally 或 afterCompletion 中调用）
     */
    public static void clear() {
        CONTEXT.remove();
    }

    // ==================== 租户信息快捷方法 ====================

    public static Long getTenantId() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getTenantId() : null;
    }

    public static void setTenantId(Long tenantId) {
        getOrCreate().setTenantId(tenantId);
    }

    public static String getTenantCode() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getTenantCode() : null;
    }

    public static TenantPlan getPlan() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getPlan() : null;
    }

    public static IsolationLevel getIsolationLevel() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getIsolationLevel() : null;
    }

    // ==================== 用户信息快捷方法 ====================

    public static Long getUserId() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getUserId() : null;
    }

    public static void setUserId(Long userId) {
        getOrCreate().setUserId(userId);
    }

    public static String getUsername() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getUsername() : null;
    }

    public static String getPlatform() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getPlatform() : null;
    }

    public static Long getAppKeyId() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getAppKeyId() : null;
    }

    public static void setAppKeyId(Long appKeyId) {
        getOrCreate().setAppKeyId(appKeyId);
    }

    public static String getOpenApiCode() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getOpenApiCode() : null;
    }

    public static void setOpenApiCode(String openApiCode) {
        getOrCreate().setOpenApiCode(openApiCode);
    }

    public static Set<String> getRoles() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getRoles() : null;
    }

    public static Set<String> getPermissions() {
        AppContext ctx = CONTEXT.get();
        return ctx != null ? ctx.getPermissions() : null;
    }
}
