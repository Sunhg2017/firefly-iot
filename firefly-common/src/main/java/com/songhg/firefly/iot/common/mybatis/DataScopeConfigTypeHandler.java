package com.songhg.firefly.iot.common.mybatis;

import org.apache.ibatis.type.MappedTypes;

/**
 * DataScopeConfig 的 MyBatis JSON TypeHandler。
 * 将 DataScopeConfig 以 JSON 字符串形式存入 roles.data_scope_config 字段。
 */
@MappedTypes(DataScopeConfig.class)
public class DataScopeConfigTypeHandler extends JsonTypeHandler<DataScopeConfig> {

    public DataScopeConfigTypeHandler() {
        super(DataScopeConfig.class);
    }
}
