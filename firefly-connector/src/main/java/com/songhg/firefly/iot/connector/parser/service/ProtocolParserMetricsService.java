package com.songhg.firefly.iot.connector.parser.service;

import com.songhg.firefly.iot.api.dto.ProtocolParserMetricsDTO;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.LongAdder;
import java.util.stream.Collectors;

@Service
@RequiredArgsConstructor
public class ProtocolParserMetricsService {

    private final MeterRegistry meterRegistry;

    private final LongAdder parseHandledCount = new LongAdder();
    private final LongAdder parseFallbackCount = new LongAdder();
    private final LongAdder parseErrorCount = new LongAdder();
    private final LongAdder encodeHandledCount = new LongAdder();
    private final LongAdder encodeFallbackCount = new LongAdder();
    private final LongAdder encodeErrorCount = new LongAdder();
    private final LongAdder debugSuccessCount = new LongAdder();
    private final LongAdder debugErrorCount = new LongAdder();

    private final LongAdder parseCostTotal = new LongAdder();
    private final LongAdder encodeCostTotal = new LongAdder();
    private final LongAdder debugCostTotal = new LongAdder();
    private final LongAdder parseCostSamples = new LongAdder();
    private final LongAdder encodeCostSamples = new LongAdder();
    private final LongAdder debugCostSamples = new LongAdder();

    private final Map<String, LongAdder> parseTransportCounters = new ConcurrentHashMap<>();
    private final Map<String, LongAdder> encodeTransportCounters = new ConcurrentHashMap<>();

    public void recordParse(String transport, String parserMode, boolean handled, boolean success, long costMs) {
        if (!success) {
            parseErrorCount.increment();
            meterRegistry.counter("firefly.protocol_parser.parse.errors", "transport", tag(transport), "mode", tag(parserMode)).increment();
        } else if (handled) {
            parseHandledCount.increment();
            meterRegistry.counter("firefly.protocol_parser.parse.handled", "transport", tag(transport), "mode", tag(parserMode)).increment();
        } else {
            parseFallbackCount.increment();
            meterRegistry.counter("firefly.protocol_parser.parse.fallback", "transport", tag(transport), "mode", tag(parserMode)).increment();
        }
        parseTransportCounters.computeIfAbsent(tag(transport), key -> new LongAdder()).increment();
        recordTimer("firefly.protocol_parser.parse.cost", transport, parserMode, costMs);
        parseCostTotal.add(costMs);
        parseCostSamples.increment();
    }

    public void recordEncode(String transport, String parserMode, boolean handled, boolean success, long costMs) {
        if (!success) {
            encodeErrorCount.increment();
            meterRegistry.counter("firefly.protocol_parser.encode.errors", "transport", tag(transport), "mode", tag(parserMode)).increment();
        } else if (handled) {
            encodeHandledCount.increment();
            meterRegistry.counter("firefly.protocol_parser.encode.handled", "transport", tag(transport), "mode", tag(parserMode)).increment();
        } else {
            encodeFallbackCount.increment();
            meterRegistry.counter("firefly.protocol_parser.encode.fallback", "transport", tag(transport), "mode", tag(parserMode)).increment();
        }
        encodeTransportCounters.computeIfAbsent(tag(transport), key -> new LongAdder()).increment();
        recordTimer("firefly.protocol_parser.encode.cost", transport, parserMode, costMs);
        encodeCostTotal.add(costMs);
        encodeCostSamples.increment();
    }

    public void recordDebug(String direction, boolean success, long costMs) {
        if (success) {
            debugSuccessCount.increment();
        } else {
            debugErrorCount.increment();
        }
        meterRegistry.counter("firefly.protocol_parser.debug.executions", "direction", tag(direction), "success", String.valueOf(success)).increment();
        meterRegistry.timer("firefly.protocol_parser.debug.cost", "direction", tag(direction)).record(Duration.ofMillis(costMs));
        debugCostTotal.add(costMs);
        debugCostSamples.increment();
    }

    public ProtocolParserMetricsDTO snapshot() {
        ProtocolParserMetricsDTO dto = new ProtocolParserMetricsDTO();
        dto.setParseHandledCount(parseHandledCount.sum());
        dto.setParseFallbackCount(parseFallbackCount.sum());
        dto.setParseErrorCount(parseErrorCount.sum());
        dto.setEncodeHandledCount(encodeHandledCount.sum());
        dto.setEncodeFallbackCount(encodeFallbackCount.sum());
        dto.setEncodeErrorCount(encodeErrorCount.sum());
        dto.setDebugSuccessCount(debugSuccessCount.sum());
        dto.setDebugErrorCount(debugErrorCount.sum());
        dto.setAvgParseCostMs(average(parseCostTotal, parseCostSamples));
        dto.setAvgEncodeCostMs(average(encodeCostTotal, encodeCostSamples));
        dto.setAvgDebugCostMs(average(debugCostTotal, debugCostSamples));
        dto.setParseTransportCounters(sumMap(parseTransportCounters));
        dto.setEncodeTransportCounters(sumMap(encodeTransportCounters));
        return dto;
    }

    private Map<String, Long> sumMap(Map<String, LongAdder> source) {
        return source.entrySet().stream().collect(Collectors.toMap(Map.Entry::getKey, entry -> entry.getValue().sum()));
    }

    private void recordTimer(String meterName, String transport, String parserMode, long costMs) {
        Timer.builder(meterName)
                .tag("transport", tag(transport))
                .tag("mode", tag(parserMode))
                .register(meterRegistry)
                .record(Duration.ofMillis(costMs));
    }

    private double average(LongAdder total, LongAdder count) {
        long samples = count.sum();
        return samples == 0 ? 0D : (double) total.sum() / samples;
    }

    private String tag(String value) {
        return value == null || value.isBlank() ? "UNKNOWN" : value;
    }
}
