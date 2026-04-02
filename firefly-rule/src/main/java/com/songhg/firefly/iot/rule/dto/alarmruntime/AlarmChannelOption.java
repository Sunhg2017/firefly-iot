package com.songhg.firefly.iot.rule.dto.alarmruntime;

import lombok.Data;

@Data
public class AlarmChannelOption {

    private Long id;
    private Long tenantId;
    private String type;
    private String name;
}
