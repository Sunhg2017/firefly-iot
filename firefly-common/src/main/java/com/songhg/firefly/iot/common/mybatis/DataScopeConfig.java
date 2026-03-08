package com.songhg.firefly.iot.common.mybatis;

import lombok.Data;

import java.io.Serializable;
import java.util.List;

/**
 * 数据范围配置，对应 roles.data_scope_config 的 JSON 结构。
 * 用于 CUSTOM / GROUP / PROJECT 等需要指定具体范围的场景。
 */
@Data
public class DataScopeConfig implements Serializable {

    private static final long serialVersionUID = 1L;

    /**
     * 允许的项目 ID 列表 (CUSTOM / PROJECT 范围使用)
     */
    private List<Long> projectIds;

    /**
     * 允许的分组 ID 列表 (GROUP 范围使用)
     */
    private List<String> groupIds;
}
