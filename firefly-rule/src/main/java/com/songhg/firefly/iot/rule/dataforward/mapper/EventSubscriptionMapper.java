package com.songhg.firefly.iot.rule.dataforward.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.rule.dataforward.entity.EventSubscription;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;

@Mapper
public interface EventSubscriptionMapper extends BaseMapper<EventSubscription> {

    int recordDeliverySuccess(@Param("id") Long id, @Param("deliveredAt") LocalDateTime deliveredAt);

    int recordDeliveryFailure(@Param("id") Long id, @Param("deliveredAt") LocalDateTime deliveredAt);
}
