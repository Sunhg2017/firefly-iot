package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.enums.DataScopeType;
import lombok.Data;

import java.util.List;

/**
 * 数据范围上下文，保存当前请求的数据范围信息。
 * 由 DataScopeAspect 计算后放入 ThreadLocal，由 DataScopeInterceptor 消费。
 */
@Data
public class DataScopeContext {

    /**
     * 数据范围类型
     */
    private DataScopeType scopeType;

    /**
     * 当前用户 ID (SELF 范围使用)
     */
    private Long userId;

    /**
     * 允许的项目 ID 列表 (PROJECT / CUSTOM 范围使用)
     */
    private List<Long> projectIds;

    /**
     * 允许的产品 ID 列表
     */
    private List<Long> productIds;

    /**
     * 允许的设备 ID 列表
     */
    private List<Long> deviceIds;

    /**
     * 允许的分组 ID 列表 (GROUP 范围使用)
     */
    private List<String> groupIds;

    // ---- 来自 @DataScope 注解的列配置 ----

    /**
     * 表别名，如 "d" 对应 d.project_id
     */
    private String tableAlias;

    /**
     * 项目字段名，默认 "project_id"
     */
    private String projectColumn;

    /**
     * 产品字段名，默认 "product_id"
     */
    private String productColumn;

    /**
     * 设备字段名，默认 "device_id"
     */
    private String deviceColumn;

    /**
     * 分组字段名，默认 "group_id"
     */
    private String groupColumn;

    /**
     * 创建者字段名，默认 "created_by"
     */
    private String createdByColumn;
}
