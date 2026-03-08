package com.songhg.firefly.iot.rule.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.AlarmLevel;
import com.songhg.firefly.iot.common.enums.AlarmStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("alarm_records")
public class AlarmRecord {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long alarmRuleId;
    private Long productId;
    private Long deviceId;
    private Long projectId;
    private AlarmLevel level;
    private AlarmStatus status;
    private String title;
    private String content;
    private String triggerValue;
    private Long confirmedBy;
    private LocalDateTime confirmedAt;
    private Long processedBy;
    private LocalDateTime processedAt;
    private String processRemark;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
