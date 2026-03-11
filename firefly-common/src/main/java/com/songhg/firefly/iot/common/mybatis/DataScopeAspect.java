package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.context.AppContext;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import lombok.extern.slf4j.Slf4j;
import org.aspectj.lang.JoinPoint;
import org.aspectj.lang.annotation.Aspect;
import org.aspectj.lang.annotation.Before;
import org.aspectj.lang.reflect.MethodSignature;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import java.lang.reflect.Method;

/**
 * AOP 切面：拦截 @DataScope 标注的 Service/Mapper 方法，
 * 从当前用户上下文计算数据范围并写入 DataScopeContextHolder。
 *
 * 数据范围由 DataScopeResolver (SPI) 提供，各业务模块自行实现。
 * 本切面仅负责调用 Resolver 并设置 ThreadLocal。
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

    @Before("@annotation(com.songhg.firefly.iot.common.mybatis.DataScope)")
    public void setDataScope(JoinPoint joinPoint) {
        AppContext appCtx = AppContextHolder.get();
        if (appCtx == null || appCtx.getUserId() == null) {
            return;
        }

        MethodSignature signature = (MethodSignature) joinPoint.getSignature();
        Method method = signature.getMethod();
        DataScope annotation = method.getAnnotation(DataScope.class);
        if (annotation == null) {
            return;
        }

        DataScopeResolver resolver = resolverProvider.getIfAvailable();
        if (resolver == null) {
            return;
        }
        DataScopeContext ctx = resolver.resolve(appCtx.getUserId(), appCtx.getTenantId());
        if (ctx != null) {
            ctx.setTableAlias(annotation.tableAlias());
            ctx.setProjectColumn(annotation.projectColumn());
            ctx.setGroupColumn(annotation.groupColumn());
            ctx.setCreatedByColumn(annotation.createdByColumn());
            DataScopeContextHolder.set(ctx);
            log.debug("DataScope set: userId={}, scope={}, projectIds={}",
                    appCtx.getUserId(), ctx.getScopeType(), ctx.getProjectIds());
        }
    }
}
