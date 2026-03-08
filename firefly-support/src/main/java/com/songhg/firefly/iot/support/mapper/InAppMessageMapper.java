package com.songhg.firefly.iot.support.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.support.entity.InAppMessage;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface InAppMessageMapper extends BaseMapper<InAppMessage> {

    @Select("SELECT COUNT(*) FROM in_app_messages WHERE tenant_id = #{tenantId} AND user_id = #{userId} AND is_read = false")
    int countUnread(Long tenantId, Long userId);
}
