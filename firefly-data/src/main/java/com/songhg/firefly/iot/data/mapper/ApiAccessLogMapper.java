package com.songhg.firefly.iot.data.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.data.entity.ApiAccessLog;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

@Mapper
public interface ApiAccessLogMapper extends BaseMapper<ApiAccessLog> {

    List<Map<String, Object>> aggregateDailyStats(@Param("statDate") LocalDate statDate);
}
