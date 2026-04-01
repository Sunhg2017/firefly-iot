package com.songhg.firefly.iot.common.mybatis;

/**
 * ThreadLocal 持有 DataScopeContext。
 * 由 DataScopeAspect 在方法执行期间写入，DataScopeInterceptor 在同一调用链内重复读取。
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

    public static void clear() {
        CONTEXT.remove();
    }
}
