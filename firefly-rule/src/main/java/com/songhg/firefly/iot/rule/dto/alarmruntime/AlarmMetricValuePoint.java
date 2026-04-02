package com.songhg.firefly.iot.rule.dto.alarmruntime;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class AlarmMetricValuePoint {

    private LocalDateTime ts;
    private Double valueNumber;
}
