package com.songhg.firefly.iot.data.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.data.dto.analysis.AggregationQueryDTO;
import com.songhg.firefly.iot.data.dto.analysis.DataExportDTO;
import com.songhg.firefly.iot.data.dto.analysis.TimeSeriesQueryDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.io.PrintWriter;
import java.util.*;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataAnalysisService {

    private final JdbcTemplate jdbcTemplate;

    private static final Set<String> VALID_AGGREGATIONS = Set.of("AVG", "SUM", "MIN", "MAX", "COUNT", "LAST", "FIRST");
    private static final Set<String> VALID_INTERVALS = Set.of("1m", "5m", "15m", "30m", "1h", "6h", "12h", "1d", "7d", "30d");

    /**
     * 查询时序数据
     */
    public Map<String, Object> queryTimeSeries(TimeSeriesQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        StringBuilder sql = new StringBuilder("SELECT time, device_id, property_name, value_double, value_string FROM device_telemetry WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        sql.append(" AND device_id = ?");
        params.add(query.getDeviceId());

        if (query.getProperties() != null && !query.getProperties().isEmpty()) {
            String placeholders = query.getProperties().stream().map(p -> "?").collect(Collectors.joining(","));
            sql.append(" AND property_name IN (").append(placeholders).append(")");
            params.addAll(query.getProperties());
        }
        if (query.getStartTime() != null && !query.getStartTime().isBlank()) {
            sql.append(" AND time >= ?::timestamptz");
            params.add(query.getStartTime());
        }
        if (query.getEndTime() != null && !query.getEndTime().isBlank()) {
            sql.append(" AND time <= ?::timestamptz");
            params.add(query.getEndTime());
        }

        // Count total
        String countSql = "SELECT COUNT(*) FROM (" + sql + ") t";
        Long total = jdbcTemplate.queryForObject(countSql, Long.class, params.toArray());

        // Order and paginate
        String orderBy = (query.getOrderBy() == null || query.getOrderBy().isBlank()) ? "time" : query.getOrderBy();
        String orderDir = query.isAsc() ? "ASC" : "DESC";
        if (!Set.of("time", "device_id", "property_name").contains(orderBy)) {
            orderBy = "time";
        }
        sql.append(" ORDER BY ").append(orderBy).append(" ").append(orderDir);
        sql.append(" LIMIT ? OFFSET ?");
        params.add(query.getPageSize());
        params.add((query.getPageNum() - 1) * query.getPageSize());

        List<Map<String, Object>> records = jdbcTemplate.queryForList(sql.toString(), params.toArray());

        Map<String, Object> result = new LinkedHashMap<>();
        result.put("records", records);
        result.put("total", total != null ? total : 0);
        result.put("pageNum", query.getPageNum());
        result.put("pageSize", query.getPageSize());
        return result;
    }

    /**
     * 聚合统计查询（使用 TimescaleDB time_bucket）
     */
    public List<Map<String, Object>> queryAggregation(AggregationQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();

        String agg = query.getAggregation() != null ? query.getAggregation().toUpperCase() : "AVG";
        if (!VALID_AGGREGATIONS.contains(agg)) agg = "AVG";

        String interval = query.getInterval();
        if (!VALID_INTERVALS.contains(interval)) interval = "1h";

        String aggFunc;
        switch (agg) {
            case "SUM" -> aggFunc = "SUM(value_double)";
            case "MIN" -> aggFunc = "MIN(value_double)";
            case "MAX" -> aggFunc = "MAX(value_double)";
            case "COUNT" -> aggFunc = "COUNT(*)";
            case "LAST" -> aggFunc = "last(value_double, time)";
            case "FIRST" -> aggFunc = "first(value_double, time)";
            default -> aggFunc = "AVG(value_double)";
        }

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT time_bucket('").append(interval).append("', time) AS bucket, ");
        sql.append("device_id, ");
        sql.append(aggFunc).append(" AS value ");
        sql.append("FROM device_telemetry ");
        sql.append("WHERE tenant_id = ? AND property_name = ?");

        List<Object> params = new ArrayList<>();
        params.add(tenantId);
        params.add(query.getProperty());

        if (query.getDeviceIds() != null && !query.getDeviceIds().isEmpty()) {
            String placeholders = query.getDeviceIds().stream().map(d -> "?").collect(Collectors.joining(","));
            sql.append(" AND device_id IN (").append(placeholders).append(")");
            params.addAll(query.getDeviceIds());
        }
        if (query.getStartTime() != null && !query.getStartTime().isBlank()) {
            sql.append(" AND time >= ?::timestamptz");
            params.add(query.getStartTime());
        }
        if (query.getEndTime() != null && !query.getEndTime().isBlank()) {
            sql.append(" AND time <= ?::timestamptz");
            params.add(query.getEndTime());
        }

        sql.append(" GROUP BY bucket, device_id ORDER BY bucket ASC");

        return jdbcTemplate.queryForList(sql.toString(), params.toArray());
    }

    /**
     * 获取设备统计概览
     */
    public Map<String, Object> getDeviceStats(Long deviceId, String property, String startTime, String endTime) {
        Long tenantId = AppContextHolder.getTenantId();

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT COUNT(*) AS count, AVG(value_double) AS avg, MIN(value_double) AS min, ");
        sql.append("MAX(value_double) AS max, last(value_double, time) AS latest ");
        sql.append("FROM device_telemetry WHERE tenant_id = ? AND device_id = ? AND property_name = ?");

        List<Object> params = new ArrayList<>();
        params.add(tenantId);
        params.add(deviceId);
        params.add(property);

        if (startTime != null && !startTime.isBlank()) {
            sql.append(" AND time >= ?::timestamptz");
            params.add(startTime);
        }
        if (endTime != null && !endTime.isBlank()) {
            sql.append(" AND time <= ?::timestamptz");
            params.add(endTime);
        }

        List<Map<String, Object>> results = jdbcTemplate.queryForList(sql.toString(), params.toArray());
        return results.isEmpty() ? Collections.emptyMap() : results.get(0);
    }

    /**
     * 导出数据为 CSV
     */
    public byte[] exportData(DataExportDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();

        StringBuilder sql = new StringBuilder("SELECT time, device_id, property_name, value_double, value_string FROM device_telemetry WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        if (dto.getDeviceIds() != null && !dto.getDeviceIds().isEmpty()) {
            String placeholders = dto.getDeviceIds().stream().map(d -> "?").collect(Collectors.joining(","));
            sql.append(" AND device_id IN (").append(placeholders).append(")");
            params.addAll(dto.getDeviceIds());
        }
        if (dto.getProperties() != null && !dto.getProperties().isEmpty()) {
            String placeholders = dto.getProperties().stream().map(p -> "?").collect(Collectors.joining(","));
            sql.append(" AND property_name IN (").append(placeholders).append(")");
            params.addAll(dto.getProperties());
        }
        if (dto.getStartTime() != null && !dto.getStartTime().isBlank()) {
            sql.append(" AND time >= ?::timestamptz");
            params.add(dto.getStartTime());
        }
        if (dto.getEndTime() != null && !dto.getEndTime().isBlank()) {
            sql.append(" AND time <= ?::timestamptz");
            params.add(dto.getEndTime());
        }
        sql.append(" ORDER BY time DESC LIMIT 50000");

        List<Map<String, Object>> records = jdbcTemplate.queryForList(sql.toString(), params.toArray());

        ByteArrayOutputStream baos = new ByteArrayOutputStream();
        PrintWriter writer = new PrintWriter(baos);
        writer.println("time,device_id,property_name,value_double,value_string");
        for (Map<String, Object> row : records) {
            writer.printf("%s,%s,%s,%s,%s%n",
                    row.getOrDefault("time", ""),
                    row.getOrDefault("device_id", ""),
                    row.getOrDefault("property_name", ""),
                    row.getOrDefault("value_double", ""),
                    escapeCsv(String.valueOf(row.getOrDefault("value_string", ""))));
        }
        writer.flush();
        return baos.toByteArray();
    }

    private String escapeCsv(String value) {
        if (value == null || "null".equals(value)) return "";
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }
}
