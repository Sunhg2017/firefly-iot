package com.songhg.firefly.iot.rule.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.rule.entity.RuleEngine;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface RuleEngineMapper extends BaseMapper<RuleEngine> {

    int recordExecutionSuccess(@Param("id") Long id, @Param("triggeredAt") LocalDateTime triggeredAt);

    int recordExecutionFailure(@Param("id") Long id, @Param("triggeredAt") LocalDateTime triggeredAt);
}
