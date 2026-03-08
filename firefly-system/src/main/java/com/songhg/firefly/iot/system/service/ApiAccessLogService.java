package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.system.dto.apikey.ApiAccessLogQueryDTO;
import com.songhg.firefly.iot.system.dto.apikey.ApiAccessLogVO;
import com.songhg.firefly.iot.system.dto.apikey.ApiCallStatsVO;
import com.songhg.firefly.iot.system.entity.ApiAccessLog;
import com.songhg.firefly.iot.system.entity.ApiCallStatsDaily;
import com.songhg.firefly.iot.system.mapper.ApiAccessLogMapper;
import com.songhg.firefly.iot.system.mapper.ApiCallStatsDailyMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
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
}
