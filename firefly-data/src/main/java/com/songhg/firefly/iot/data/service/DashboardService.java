package com.songhg.firefly.iot.data.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class DashboardService {

    private final JdbcTemplate jdbcTemplate;

    public Map<String, Object> getOverviewStats() {
        Long tenantId = AppContextHolder.getTenantId();
        Map<String, Object> stats = new LinkedHashMap<>();

        long deviceTotal = countOrZero("SELECT COUNT(*) FROM devices WHERE tenant_id = ?", tenantId);
        long deviceOnline = countOrZero(
                "SELECT COUNT(*) FROM devices WHERE tenant_id = ? AND online_status = 'ONLINE'", tenantId);
        long productTotal = countOrZero("SELECT COUNT(*) FROM products WHERE tenant_id = ?", tenantId);
        long alarmToday = countOrZero(
                "SELECT COUNT(*) FROM alarm_records WHERE tenant_id = ? AND created_at >= CURRENT_DATE", tenantId);
        long alarmPending = countOrZero(
                "SELECT COUNT(*) FROM alarm_records WHERE tenant_id = ? AND status IN ('TRIGGERED', 'CONFIRMED')", tenantId);
        long ruleTotal = countOrZero("SELECT COUNT(*) FROM rule_engines WHERE tenant_id = ?", tenantId);
        long ruleEnabled = countOrZero(
                "SELECT COUNT(*) FROM rule_engines WHERE tenant_id = ? AND status = 'ENABLED'", tenantId);

        stats.put("deviceTotal", deviceTotal);
        stats.put("deviceOnline", deviceOnline);
        stats.put("deviceOffline", deviceTotal - deviceOnline);
        stats.put("productTotal", productTotal);
        stats.put("alarmToday", alarmToday);
        stats.put("alarmPending", alarmPending);
        stats.put("ruleTotal", ruleTotal);
        stats.put("ruleEnabled", ruleEnabled);

        return stats;
    }

    public List<Map<String, Object>> getDeviceOnlineTrend(String interval) {
        Long tenantId = AppContextHolder.getTenantId();
        String bucketInterval = "1d".equals(interval) ? "1 day" : "1 hour";
        String timeRange = "1d".equals(interval) ? "30 days" : "7 days";

        String sql = """
                SELECT time_bucket('%s', time) AS bucket,
                       COUNT(DISTINCT device_id) AS online_count
                FROM device_telemetry
                WHERE tenant_id = ? AND time >= now() - INTERVAL '%s'
                GROUP BY bucket
                ORDER BY bucket ASC
                """.formatted(bucketInterval, timeRange);

        try {
            return jdbcTemplate.queryForList(sql, tenantId);
        } catch (Exception e) {
            log.warn("Failed to query device online trend: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<Map<String, Object>> getAlarmLevelDistribution() {
        Long tenantId = AppContextHolder.getTenantId();
        String sql = "SELECT level, COUNT(*) AS count FROM alarm_records WHERE tenant_id = ? AND created_at >= now() - INTERVAL '30 days' GROUP BY level ORDER BY count DESC";
        try {
            return jdbcTemplate.queryForList(sql, tenantId);
        } catch (Exception e) {
            log.warn("Failed to query alarm distribution: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<Map<String, Object>> getRecentAlarms(int limit) {
        Long tenantId = AppContextHolder.getTenantId();
        String sql = """
                SELECT id,
                       device_id,
                       title AS rule_name,
                       level,
                       status,
                       content AS message,
                       created_at
                FROM alarm_records
                WHERE tenant_id = ?
                ORDER BY created_at DESC
                LIMIT ?
                """;
        try {
            return jdbcTemplate.queryForList(sql, tenantId, limit);
        } catch (Exception e) {
            log.warn("Failed to query recent alarms: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    public List<Map<String, Object>> getDeviceByProduct() {
        Long tenantId = AppContextHolder.getTenantId();
        String sql = """
                SELECT p.name AS product_name, COUNT(d.id) AS device_count
                FROM devices d
                JOIN products p ON d.product_id = p.id
                WHERE d.tenant_id = ?
                GROUP BY p.name
                ORDER BY device_count DESC
                LIMIT 10
                """;
        try {
            return jdbcTemplate.queryForList(sql, tenantId);
        } catch (Exception e) {
            log.warn("Failed to query device by product: {}", e.getMessage());
            return Collections.emptyList();
        }
    }

    private long countOrZero(String sql, Long tenantId) {
        try {
            Long value = jdbcTemplate.queryForObject(sql, Long.class, tenantId);
            return value != null ? value : 0L;
        } catch (Exception e) {
            log.warn("Dashboard count query fallback to 0, sql={}, reason={}", sql, e.getMessage());
            return 0L;
        }
    }
}
