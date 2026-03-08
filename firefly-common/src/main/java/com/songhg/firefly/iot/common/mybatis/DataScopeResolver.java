package com.songhg.firefly.iot.common.mybatis;

/**
 * 数据范围解析器 SPI。
 * 各业务模块提供自己的实现，根据用户角色配置计算数据范围上下文。
 */
public interface DataScopeResolver {

    /**
     * 根据用户 ID 和租户 ID，解析当前用户的最宽数据范围。
     * 如果用户有多个角色，取最宽范围 (ALL > PROJECT > GROUP > SELF)。
     *
     * @param userId   当前用户 ID
     * @param tenantId 当前租户 ID
     * @return DataScopeContext，如果返回 null 则不做过滤
     */
    DataScopeContext resolve(Long userId, Long tenantId);
}
