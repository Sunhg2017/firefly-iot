package com.songhg.firefly.iot.common.mybatis;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 数据范围注解，标注在 Mapper 方法或 Service 方法上。
 * 由 DataScopeInterceptor 拦截，自动在 SQL WHERE 中追加数据范围过滤条件。
 *
 * dataScope 取自当前用户最宽角色的 data_scope 字段:
 *   ALL     — 不追加任何条件 (租户内全部数据)
 *   PROJECT — WHERE {tableAlias}.project_id IN (用户绑定的 project_id 列表)
 *   GROUP   — WHERE {tableAlias}.group_id IN (角色配置的设备分组 dataScopeConfig.groupIds)
 *   SELF    — WHERE {tableAlias}.created_by = {userId}
 *   CUSTOM  — WHERE {tableAlias}.project_id IN (角色 dataScopeConfig.projectIds)
 */
@Target({ElementType.METHOD})
@Retention(RetentionPolicy.RUNTIME)
@Documented
public @interface DataScope {

    /**
     * 主表别名，默认空 (无别名)。
     * 如: @DataScope(tableAlias = "d") 对应 SQL: d.project_id IN (...)
     */
    String tableAlias() default "";

    /**
     * 项目字段名，默认 "project_id"。
     */
    String projectColumn() default "project_id";

    /**
     * 产品字段名，默认 "product_id"。
     */
    String productColumn() default "product_id";

    /**
     * 设备字段名，默认 "device_id"。
     */
    String deviceColumn() default "device_id";

    /**
     * 设备分组字段名，默认 "group_id"。GROUP 范围时使用。
     */
    String groupColumn() default "group_id";

    /**
     * 创建者字段名，默认 "created_by"。SELF 范围时使用。
     */
    String createdByColumn() default "created_by";
}
