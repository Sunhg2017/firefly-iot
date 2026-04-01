package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;

/**
 * AOP 切面：拦截 @DataScope 标注的 Service/Mapper 方法，
 * 从当前用户上下文计算数据范围并在整个方法调用期间写入 DataScopeContextHolder。
 *
 * 数据范围由 DataScopeResolver (SPI) 提供，各业务模块自行实现。
 * 之所以用 Around 而不是 Before，是因为分页查询会执行 count + records 多条 SQL，
 * 需要让同一方法内的所有 SQL 共享同一个数据范围上下文。
 */
@Slf4j
@Aspect
@Component
@Order(2)
public class DataScopeAspect {

    private final ObjectProvider<DataScopeResolver> resolverProvider;

    public DataScopeAspect(ObjectProvider<DataScopeResolver> resolverProvider) {
        this.resolverProvider = resolverProvider;
    }

    @Around("@annotation(com.songhg.firefly.iot.common.mybatis.DataScope)")
    public Object withDataScope(ProceedingJoinPoint joinPoint) throws Throwable {
        AppContext appCtx = AppContextHolder.get();
        if (appCtx == null || appCtx.getUserId() == null) {
            return joinPoint.proceed();
        }

        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        DataScope annotation = method.getAnnotation(DataScope.class);
        if (annotation == null) {
            return joinPoint.proceed();
        }

        DataScopeResolver resolver = resolverProvider.getIfAvailable();
        if (resolver == null) {
            return joinPoint.proceed();
        }
        DataScopeContext ctx = resolver.resolve(appCtx.getUserId(), appCtx.getTenantId());
        if (ctx == null) {
            return joinPoint.proceed();
        }

        ctx.setTableAlias(annotation.tableAlias());
        ctx.setProjectColumn(annotation.projectColumn());
        ctx.setProductColumn(annotation.productColumn());
        ctx.setDeviceColumn(annotation.deviceColumn());
        ctx.setGroupColumn(annotation.groupColumn());
        ctx.setCreatedByColumn(annotation.createdByColumn());

        DataScopeContext previous = DataScopeContextHolder.get();
        DataScopeContextHolder.set(ctx);
        log.debug("DataScope set: userId={}, scope={}, projectIds={}, productIds={}, deviceIds={}",
                appCtx.getUserId(), ctx.getScopeType(), ctx.getProjectIds(), ctx.getProductIds(), ctx.getDeviceIds());
        try {
            return joinPoint.proceed();
        } finally {
            if (previous != null) {
                DataScopeContextHolder.set(previous);
            } else {
                DataScopeContextHolder.clear();
            }
        }
    }
}
