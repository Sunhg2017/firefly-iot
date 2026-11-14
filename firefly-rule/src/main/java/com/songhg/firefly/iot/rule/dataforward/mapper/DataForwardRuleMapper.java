package com.songhg.firefly.iot.rule.dataforward.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface DataForwardRuleMapper extends BaseMapper<DataForwardRule> {

    int recordExecutionSuccess(@Param("id") Long id, @Param("triggeredAt") LocalDateTime triggeredAt);

    int recordExecutionFailure(@Param("id") Long id, @Param("triggeredAt") LocalDateTime triggeredAt);
}
