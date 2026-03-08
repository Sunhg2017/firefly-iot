package com.songhg.firefly.iot.common.audit;

import com.songhg.firefly.iot.common.enums.AuditAction;
import com.songhg.firefly.iot.common.enums.AuditModule;

import java.lang.annotation.*;

/**
 * 审计日志注解
 * <p>
 * 标注在 Controller 方法上，由 AOP 自动记录操作日志。
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface Auditable {

    AuditModule module();

    AuditAction action();

    String description() default "";
}
