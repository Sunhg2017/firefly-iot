package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.config.TelemetryGovernanceProperties;
import com.songhg.firefly.iot.device.dto.devicedata.TelemetryRetentionVO;
import com.songhg.firefly.iot.device.entity.TenantTelemetryRetention;
import com.songhg.firefly.iot.device.mapper.TelemetryRetentionMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

/**
 * 时序数据保留策略：读取/设置当前租户保留天数，并执行跨租户过期清理。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class TelemetryRetentionService {

    private final TelemetryRetentionMapper retentionMapper;
    private final TelemetryGovernanceProperties properties;

    public TelemetryRetentionVO getRetention() {
        Long tenantId = AppContextHolder.getTenantId();
        TenantTelemetryRetention retention = tenantId == null ? null : retentionMapper.selectByTenantId(tenantId);

        TelemetryRetentionVO vo = new TelemetryRetentionVO();
        vo.setDefaultRetentionDays(properties.getDefaultRetentionDays());
        vo.setGlobalMaxRetentionDays(properties.getGlobalMaxRetentionDays());
        if (retention == null) {
            vo.setRetentionDays(properties.getDefaultRetentionDays());
            vo.setUsingDefault(true);
        } else {
            vo.setRetentionDays(retention.getRetentionDays());
            vo.setUsingDefault(false);
        }
        return vo;
    }

    public TelemetryRetentionVO setRetention(Integer retentionDays) {
        validateRetentionDays(retentionDays);
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }

        TenantTelemetryRetention retention = new TenantTelemetryRetention();
        retention.setTenantId(tenantId);
        retention.setRetentionDays(retentionDays);
        retention.setUpdatedBy(AppContextHolder.getUserId());
        retentionMapper.upsert(retention);
        log.info("Telemetry retention updated: tenantId={}, retentionDays={}", tenantId, retentionDays);
        return getRetention();
    }

    public TelemetryRetentionVO resetRetention() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }
        retentionMapper.deleteByTenantId(tenantId);
        log.info("Telemetry retention reset to default: tenantId={}", tenantId);
        return getRetention();
    }

    /**
     * 跨租户清理过期遥测数据：
     * 1) 已配置租户按其 retention_days 删除；
     * 2) 未配置租户按全局默认天数删除。
     * 使用 @InterceptorIgnore 绕过租户行级隔离，SQL 内显式按 tenant_id 关联。
     */
    public void cleanupExpiredTelemetry() {
        int overrideRows = retentionMapper.deleteExpiredForTenantsWithOverride();
        int defaultRows = retentionMapper.deleteExpiredForDefaultTenants(properties.getDefaultRetentionDays());
        log.info("Telemetry retention cleanup finished: overrideRows={}, defaultRows={}, defaultDays={}",
                overrideRows, defaultRows, properties.getDefaultRetentionDays());
    }

    private void validateRetentionDays(Integer retentionDays) {
        if (retentionDays == null || retentionDays < 1) {
            throw new BizException(ResultCode.PARAM_ERROR, "保留天数至少为 1 天");
        }
        if (retentionDays > properties.getGlobalMaxRetentionDays()) {
            throw new BizException(ResultCode.PARAM_ERROR,
                    "保留天数不能超过全局上限 " + properties.getGlobalMaxRetentionDays() + " 天");
        }
    }
}
