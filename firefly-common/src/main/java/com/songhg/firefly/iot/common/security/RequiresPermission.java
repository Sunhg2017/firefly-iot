package com.songhg.firefly.iot.common.security;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 权限校验注解。标注在 Controller 方法或类上，表示需要指定权限才能访问。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface RequiresPermission {

    /**
     * 所需权限标识，支持多个
     */
    String[] value();

    /**
     * 多个权限之间的逻辑关系，默认 AND
     */
    Logical logical() default Logical.AND;

    enum Logical {
        AND, OR
    }
}
