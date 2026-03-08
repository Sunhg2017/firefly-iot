package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.system.entity.ApiKey;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface ApiKeyMapper extends BaseMapper<ApiKey> {

    ApiKey findByAccessKey(@Param("accessKey") String accessKey);
}
