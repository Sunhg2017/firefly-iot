package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.system.entity.ApiAccessLog;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface ApiAccessLogMapper extends BaseMapper<ApiAccessLog> {
}
