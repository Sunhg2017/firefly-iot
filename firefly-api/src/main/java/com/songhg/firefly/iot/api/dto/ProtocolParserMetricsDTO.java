package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.util.Map;

@Data
public class ProtocolParserMetricsDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private long parseHandledCount;
    private long parseFallbackCount;
    private long parseErrorCount;
    private long encodeHandledCount;
    private long encodeFallbackCount;
    private long encodeErrorCount;
    private long debugSuccessCount;
    private long debugErrorCount;
    private double avgParseCostMs;
    private double avgEncodeCostMs;
    private double avgDebugCostMs;
    private Map<String, Long> parseTransportCounters;
    private Map<String, Long> encodeTransportCounters;
}
