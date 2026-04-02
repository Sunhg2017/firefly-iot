package com.songhg.firefly.iot.rule.dto.alarmruntime;

import lombok.Data;

@Data
public class AlarmMetricAggregate {

    private Long sampleCount;
    private Double avgValue;
    private Double maxValue;
    private Double minValue;
    private Double sumValue;
    private Double latestValue;
}
