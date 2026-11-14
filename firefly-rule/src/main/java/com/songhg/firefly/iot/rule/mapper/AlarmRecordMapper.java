package com.songhg.firefly.iot.rule.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.rule.entity.AlarmRecord;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface AlarmRecordMapper extends BaseMapper<AlarmRecord> {

    /**
     * 幂等插入进行中告警：命中部分唯一索引时返回 0，不抛异常。
     */
    int insertOpenIfAbsent(@Param("record") AlarmRecord record);
}
