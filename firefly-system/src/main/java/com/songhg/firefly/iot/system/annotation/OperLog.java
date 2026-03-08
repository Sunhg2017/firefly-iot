package com.songhg.firefly.iot.system.annotation;

import java.lang.annotation.*;

@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface OperLog {

    String module() default "";

    String operationType() default "";

    String description() default "";
}
