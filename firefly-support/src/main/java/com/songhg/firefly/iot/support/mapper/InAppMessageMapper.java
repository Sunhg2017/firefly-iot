package com.songhg.firefly.iot.support.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.support.entity.InAppMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface InAppMessageMapper extends BaseMapper<InAppMessage> {

    int countUnread(@Param("tenantId") Long tenantId, @Param("userId") Long userId);
}
