package com.songhg.firefly.iot.data.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.data.dto.apikey.ApiAccessLogQueryDTO;
import com.songhg.firefly.iot.data.dto.apikey.ApiAccessLogVO;
import com.songhg.firefly.iot.data.dto.apikey.ApiCallStatsVO;
import com.songhg.firefly.iot.data.entity.ApiAccessLog;
import com.songhg.firefly.iot.data.entity.ApiCallStatsDaily;
import com.songhg.firefly.iot.data.mapper.ApiAccessLogMapper;
import com.songhg.firefly.iot.data.mapper.ApiCallStatsDailyMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class ApiAccessLogService {

    private final ApiAccessLogMapper apiAccessLogMapper;
    private final ApiCallStatsDailyMapper apiCallStatsDailyMapper;

    public IPage<ApiAccessLogVO> queryLogs(Long apiKeyId, ApiAccessLogQueryDTO query) {
        Page<ApiAccessLog> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<ApiAccessLog> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ApiAccessLog::getApiKeyId, apiKeyId);
        if (query.getStartTime() != null) {
            wrapper.ge(ApiAccessLog::getCreatedAt, query.getStartTime());
        }
        if (query.getEndTime() != null) {
            wrapper.le(ApiAccessLog::getCreatedAt, query.getEndTime());
        }
        if (query.getMethod() != null && !query.getMethod().isBlank()) {
            wrapper.eq(ApiAccessLog::getMethod, query.getMethod());
        }
        if (query.getPath() != null && !query.getPath().isBlank()) {
            wrapper.like(ApiAccessLog::getPath, query.getPath());
        }
        if (query.getStatusCode() != null) {
            wrapper.eq(ApiAccessLog::getStatusCode, query.getStatusCode());
        }
        wrapper.orderByDesc(ApiAccessLog::getCreatedAt);

        IPage<ApiAccessLog> result = apiAccessLogMapper.selectPage(page, wrapper);
        return result.convert(this::toLogVO);
    }

    public List<ApiCallStatsVO> queryStats(Long apiKeyId, LocalDate startDate, LocalDate endDate) {
        LambdaQueryWrapper<ApiCallStatsDaily> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(ApiCallStatsDaily::getApiKeyId, apiKeyId);
        if (startDate != null) {
            wrapper.ge(ApiCallStatsDaily::getStatDate, startDate);
        }
        if (endDate != null) {
            wrapper.le(ApiCallStatsDaily::getStatDate, endDate);
        }
        wrapper.orderByAsc(ApiCallStatsDaily::getStatDate);

        return apiCallStatsDailyMapper.selectList(wrapper).stream()
                .map(this::toStatsVO)
                .collect(Collectors.toList());
    }

    /**
     * 聚合指定日期的调用日志并写入日报表。由定时任务调用。
     */
    public void aggregateDaily(LocalDate statDate) {
        List<Map<String, Object>> rows = apiAccessLogMapper.aggregateDailyStats(statDate);
        int count = 0;
        for (Map<String, Object> row : rows) {
            Long apiKeyId = toLong(row.get("apiKeyId"));
            Long tenantId = toLong(row.get("tenantId"));

            // 检查是否已存在（幂等）
            Long exists = apiCallStatsDailyMapper.selectCount(new LambdaQueryWrapper<ApiCallStatsDaily>()
                    .eq(ApiCallStatsDaily::getApiKeyId, apiKeyId)
                    .eq(ApiCallStatsDaily::getStatDate, statDate));
            if (exists > 0) continue;

            ApiCallStatsDaily stats = new ApiCallStatsDaily();
            stats.setApiKeyId(apiKeyId);
            stats.setTenantId(tenantId);
            stats.setStatDate(statDate);
            stats.setTotalCalls(toLong(row.get("totalCalls")));
            stats.setSuccessCalls(toLong(row.get("successCalls")));
            stats.setErrorCalls(toLong(row.get("errorCalls")));
            stats.setAvgLatencyMs(toInt(row.get("avgLatencyMs")));
            stats.setMaxLatencyMs(toInt(row.get("maxLatencyMs")));
            stats.setP99LatencyMs(toInt(row.get("p99LatencyMs")));
            apiCallStatsDailyMapper.insert(stats);
            count++;
        }
        log.info("Daily stats aggregated for {}: {} records", statDate, count);
    }

    private ApiAccessLogVO toLogVO(ApiAccessLog entity) {
        ApiAccessLogVO vo = new ApiAccessLogVO();
        vo.setId(entity.getId());
        vo.setApiKeyId(entity.getApiKeyId());
        vo.setMethod(entity.getMethod());
        vo.setPath(entity.getPath());
        vo.setStatusCode(entity.getStatusCode());
        vo.setLatencyMs(entity.getLatencyMs());
        vo.setClientIp(entity.getClientIp());
        vo.setRequestSize(entity.getRequestSize());
        vo.setResponseSize(entity.getResponseSize());
        vo.setErrorMessage(entity.getErrorMessage());
        vo.setCreatedAt(entity.getCreatedAt());
        return vo;
    }

    private ApiCallStatsVO toStatsVO(ApiCallStatsDaily entity) {
        ApiCallStatsVO vo = new ApiCallStatsVO();
        vo.setStatDate(entity.getStatDate());
        vo.setTotalCalls(entity.getTotalCalls());
        vo.setSuccessCalls(entity.getSuccessCalls());
        vo.setErrorCalls(entity.getErrorCalls());
        vo.setAvgLatencyMs(entity.getAvgLatencyMs());
        vo.setMaxLatencyMs(entity.getMaxLatencyMs());
        vo.setP99LatencyMs(entity.getP99LatencyMs());
        return vo;
    }

    private Long toLong(Object val) {
        if (val == null) return 0L;
        if (val instanceof Number) return ((Number) val).longValue();
        return Long.parseLong(val.toString());
    }

    private Integer toInt(Object val) {
        if (val == null) return 0;
        if (val instanceof Number) return ((Number) val).intValue();
        return Integer.parseInt(val.toString());
    }
}
