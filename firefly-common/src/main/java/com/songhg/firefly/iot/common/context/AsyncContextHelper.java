package com.songhg.firefly.iot.common.context;

/**
 * 异步线程上下文辅助工具
 * <p>
 * 在 @Async 方法中，ThreadLocal 上下文不会自动传播到新线程。
 * 此工具类提供一行代码设置/清理上下文的便捷方式，
 * 内部使用统一的 {@link AppContextHolder}。
 */
public final class AsyncContextHelper {

    private AsyncContextHelper() {
    }

    /**
     * 在异步线程中设置租户和用户上下文
     *
     * @param tenantId 租户ID
     * @param userId   用户ID
     */
    public static void setContext(Long tenantId, Long userId) {
        AppContext ctx = new AppContext();
        ctx.setTenantId(tenantId);
        ctx.setUserId(userId);
        AppContextHolder.set(ctx);
    }

    /**
     * 清理上下文（应在 finally 块中调用）
     */
    public static void clearContext() {
        AppContextHolder.clear();
    }
}
