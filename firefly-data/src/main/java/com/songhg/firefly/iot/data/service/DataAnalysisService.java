package com.songhg.firefly.iot.data.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.data.dto.analysis.AggregationQueryDTO;
import com.songhg.firefly.iot.data.dto.analysis.DataExportDTO;
import com.songhg.firefly.iot.data.dto.analysis.DataExportResult;
import com.songhg.firefly.iot.data.dto.analysis.PropertyOptionQueryDTO;
import com.songhg.firefly.iot.data.dto.analysis.TimeSeriesQueryDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class DataAnalysisService {

    private static final Set<String> VALID_AGGREGATIONS = Set.of("AVG", "SUM", "MIN", "MAX", "COUNT", "LAST", "FIRST");
    private static final Set<String> VALID_INTERVALS = Set.of("1m", "5m", "15m", "30m", "1h", "6h", "12h", "1d", "7d", "30d");
    private static final int MAX_EXPORT_ROWS = 50000;

    private final JdbcTemplate jdbcTemplate;

    /**
     * 查询时序数据。
     * 查询结果直接补齐 productKey / deviceName，避免前端把内部 device_id 当作主视角字段展示。
     */
    public Map<String, Object> queryTimeSeries(TimeSeriesQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        StringBuilder sql = new StringBuilder("""
                SELECT t.time,
                       p.product_key,
                       d.device_name,
                       d.nickname AS device_nickname,
                       t.property_name,
                       t.value_double,
                       t.value_string
                FROM device_telemetry t
                JOIN devices d ON d.id = t.device_id AND d.tenant_id = t.tenant_id AND d.deleted_at IS NULL
                LEFT JOIN products p ON p.id = d.product_id AND p.tenant_id = t.tenant_id
                WHERE t.tenant_id = ?
                """);
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        sql.append(" AND t.device_id = ?");
        params.add(query.getDeviceId());

        appendPropertyFilter(sql, params, query.getProperties(), "t.property_name");
        appendTimeRange(sql, params, query.getStartTime(), query.getEndTime(), "t.time");

        String countSql = "SELECT COUNT(*) FROM (" + sql + ") t";
        Long total = jdbcTemplate.queryForObject(countSql, Long.class, params.toArray());

        String orderBy = switch (query.getOrderBy() == null ? "time" : query.getOrderBy()) {
            case "device_name" -> "d.device_name";
            case "property_name" -> "t.property_name";
            case "product_key" -> "p.product_key";
            default -> "t.time";
        };
        sql.append(" ORDER BY ").append(orderBy).append(query.isAsc() ? " ASC" : " DESC");
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

    public List<Map<String, Object>> queryAggregation(AggregationQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();

        String agg = query.getAggregation() != null ? query.getAggregation().toUpperCase() : "AVG";
        if (!VALID_AGGREGATIONS.contains(agg)) {
            agg = "AVG";
        }

        String interval = VALID_INTERVALS.contains(query.getInterval()) ? query.getInterval() : "1h";
        String aggFunc = switch (agg) {
            case "SUM" -> "SUM(t.value_double)";
            case "MIN" -> "MIN(t.value_double)";
            case "MAX" -> "MAX(t.value_double)";
            case "COUNT" -> "COUNT(*)";
            case "LAST" -> "last(t.value_double, t.time)";
            case "FIRST" -> "first(t.value_double, t.time)";
            default -> "AVG(t.value_double)";
        };

        StringBuilder sql = new StringBuilder();
        sql.append("SELECT time_bucket('").append(interval).append("', t.time) AS bucket, ");
        sql.append("p.product_key, d.device_name, ");
        sql.append(aggFunc).append(" AS value ");
        sql.append("FROM device_telemetry t ");
        sql.append("JOIN devices d ON d.id = t.device_id AND d.tenant_id = t.tenant_id AND d.deleted_at IS NULL ");
        sql.append("LEFT JOIN products p ON p.id = d.product_id AND p.tenant_id = t.tenant_id ");
        sql.append("WHERE t.tenant_id = ? AND t.property_name = ?");

        List<Object> params = new ArrayList<>();
        params.add(tenantId);
        params.add(query.getProperty());

        if (query.getDeviceIds() != null && !query.getDeviceIds().isEmpty()) {
            String placeholders = query.getDeviceIds().stream().map(id -> "?").collect(Collectors.joining(","));
            sql.append(" AND t.device_id IN (").append(placeholders).append(")");
            params.addAll(query.getDeviceIds());
        }
        appendTimeRange(sql, params, query.getStartTime(), query.getEndTime(), "t.time");

        sql.append(" GROUP BY bucket, p.product_key, d.device_name ORDER BY bucket ASC");
        return jdbcTemplate.queryForList(sql.toString(), params.toArray());
    }

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
        appendTimeRange(sql, params, startTime, endTime, "time");

        List<Map<String, Object>> results = jdbcTemplate.queryForList(sql.toString(), params.toArray());
        return results.isEmpty() ? Collections.emptyMap() : results.get(0);
    }

    public List<String> listAvailableProperties(PropertyOptionQueryDTO query) {
        List<Long> deviceIds = query.getDeviceIds() == null ? Collections.emptyList() : query.getDeviceIds();
        if (deviceIds.isEmpty()) {
            return Collections.emptyList();
        }

        Long tenantId = AppContextHolder.getTenantId();
        StringBuilder sql = new StringBuilder("SELECT DISTINCT property_name FROM device_telemetry WHERE tenant_id = ?");
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        String placeholders = deviceIds.stream().map(id -> "?").collect(Collectors.joining(","));
        sql.append(" AND device_id IN (").append(placeholders).append(")");
        params.addAll(deviceIds);
        appendTimeRange(sql, params, query.getStartTime(), query.getEndTime(), "time");
        sql.append(" ORDER BY property_name ASC LIMIT 200");

        return jdbcTemplate.queryForList(sql.toString(), String.class, params.toArray());
    }

    public DataExportResult queryExportData(DataExportDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        StringBuilder sql = new StringBuilder("""
                SELECT t.time,
                       p.product_key,
                       p.name AS product_name,
                       d.device_name,
                       d.nickname AS device_nickname,
                       t.property_name,
                       t.value_double,
                       t.value_string
                FROM device_telemetry t
                JOIN devices d ON d.id = t.device_id AND d.tenant_id = t.tenant_id AND d.deleted_at IS NULL
                LEFT JOIN products p ON p.id = d.product_id AND p.tenant_id = t.tenant_id
                WHERE t.tenant_id = ?
                """);
        List<Object> params = new ArrayList<>();
        params.add(tenantId);

        if (dto.getDeviceIds() != null && !dto.getDeviceIds().isEmpty()) {
            String placeholders = dto.getDeviceIds().stream().map(id -> "?").collect(Collectors.joining(","));
            sql.append(" AND t.device_id IN (").append(placeholders).append(")");
            params.addAll(dto.getDeviceIds());
        }
        appendPropertyFilter(sql, params, dto.getProperties(), "t.property_name");
        appendTimeRange(sql, params, dto.getStartTime(), dto.getEndTime(), "t.time");
        sql.append(" ORDER BY t.time DESC LIMIT ?");
        params.add(MAX_EXPORT_ROWS + 1);

        List<Map<String, Object>> records = jdbcTemplate.queryForList(sql.toString(), params.toArray());
        boolean truncated = records.size() > MAX_EXPORT_ROWS;
        if (truncated) {
            records = new ArrayList<>(records.subList(0, MAX_EXPORT_ROWS));
        }
        return new DataExportResult(records, truncated);
    }

    private void appendPropertyFilter(StringBuilder sql, List<Object> params, List<String> properties, String columnName) {
        if (properties == null || properties.isEmpty()) {
            return;
        }
        String placeholders = properties.stream().map(item -> "?").collect(Collectors.joining(","));
        sql.append(" AND ").append(columnName).append(" IN (").append(placeholders).append(")");
        params.addAll(properties);
    }

    private void appendTimeRange(StringBuilder sql, List<Object> params, String startTime, String endTime, String columnName) {
        if (startTime != null && !startTime.isBlank()) {
            sql.append(" AND ").append(columnName).append(" >= ?::timestamptz");
            params.add(startTime);
        }
        if (endTime != null && !endTime.isBlank()) {
            sql.append(" AND ").append(columnName).append(" <= ?::timestamptz");
            params.add(endTime);
        }
    }
}
