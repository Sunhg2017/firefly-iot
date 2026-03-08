package com.songhg.firefly.iot.common.mybatis;

/**
 * ThreadLocal 持有 DataScopeContext。
 * 由 DataScopeAspect 写入，DataScopeInterceptor 读取并消费 (一次性)。
 */
public final class DataScopeContextHolder {

    private static final ThreadLocal<DataScopeContext> CONTEXT = new ThreadLocal<>();

    private DataScopeContextHolder() {
    }

    public static void set(DataScopeContext ctx) {
        CONTEXT.set(ctx);
    }

    public static DataScopeContext get() {
        return CONTEXT.get();
    }

    public static DataScopeContext getAndClear() {
        DataScopeContext ctx = CONTEXT.get();
        CONTEXT.remove();
        return ctx;
    }

    public static void clear() {
        CONTEXT.remove();
    }
}
