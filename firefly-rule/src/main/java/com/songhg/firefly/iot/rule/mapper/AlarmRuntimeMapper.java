package com.songhg.firefly.iot.rule.mapper;

import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmChannelOption;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmMetricAggregate;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmMetricValuePoint;
import com.songhg.firefly.iot.rule.dto.alarmruntime.AlarmRecipientUser;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

import java.time.LocalDateTime;
import java.util.List;

@Mapper
public interface AlarmRuntimeMapper {

    AlarmMetricAggregate selectMetricAggregate(@Param("tenantId") Long tenantId,
                                               @Param("deviceId") Long deviceId,
                                               @Param("property") String property,
                                               @Param("startTime") LocalDateTime startTime,
                                               @Param("endTime") LocalDateTime endTime);

    List<AlarmMetricValuePoint> selectRecentNumericValues(@Param("tenantId") Long tenantId,
                                                          @Param("deviceId") Long deviceId,
                                                          @Param("property") String property,
                                                          @Param("limit") Integer limit);

    List<String> selectExistingGroupCodes(@Param("tenantId") Long tenantId,
                                          @Param("groupCodes") List<String> groupCodes);

    List<AlarmRecipientUser> selectActiveUsersByUsernames(@Param("tenantId") Long tenantId,
                                                          @Param("usernames") List<String> usernames);

    List<AlarmRecipientUser> selectActiveGroupUsers(@Param("tenantId") Long tenantId,
                                                    @Param("groupCodes") List<String> groupCodes);

    List<AlarmChannelOption> selectAvailableChannelsByTypes(@Param("tenantId") Long tenantId,
                                                            @Param("types") List<String> types);
}
