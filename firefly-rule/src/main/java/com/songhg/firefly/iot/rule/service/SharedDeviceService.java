package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.DeviceDataClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetryPointDTO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceResolveRequestDTO;
import com.songhg.firefly.iot.api.dto.SharedDeviceTelemetryQueryDTO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ShareStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.dto.share.SharedDeviceVO;
import com.songhg.firefly.iot.rule.entity.ShareAuditLog;
import com.songhg.firefly.iot.rule.entity.SharePolicy;
import com.songhg.firefly.iot.rule.mapper.ShareAuditLogMapper;
import com.songhg.firefly.iot.rule.mapper.SharePolicyMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class SharedDeviceService {

    private final SharePolicyMapper policyMapper;
    private final ShareAuditLogMapper auditLogMapper;
    private final SharePolicyRuleSupport ruleSupport;
    private final DeviceClient deviceClient;
    private final DeviceDataClient deviceDataClient;

    public List<SharedDeviceVO> listSharedDevices(Long policyId, String ipAddress) {
        if (policyId != null) {
            SharePolicy policy = getApprovedConsumedPolicyOrThrow(policyId);
            return resolvePolicyDevices(policy, true, ipAddress);
        }

        Long tenantId = requireCurrentTenantId();
        LambdaQueryWrapper<SharePolicy> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SharePolicy::getConsumerTenantId, tenantId)
                .eq(SharePolicy::getStatus, ShareStatus.APPROVED)
                .orderByDesc(SharePolicy::getCreatedAt);
        List<SharePolicy> policies = policyMapper.selectList(wrapper);
        List<SharedDeviceVO> result = new ArrayList<>();
        for (SharePolicy policy : policies) {
            try {
                result.addAll(resolvePolicyDevices(policy, false, ipAddress));
            } catch (BizException ex) {
                log.warn("Skip invalid shared policy when resolving device list: policyId={}, message={}",
                        policy.getId(), ex.getMessage());
            }
        }
        return result;
    }

    public List<DeviceTelemetrySnapshotDTO> querySharedLatest(Long policyId, Long deviceId, String ipAddress) {
        SharePolicy policy = getApprovedConsumedPolicyOrThrow(policyId);
        SharePolicyRuleSupport.PermissionConfig permissionConfig = ruleSupport.parsePermissions(policy.getDataPermissions());
        if (!permissionConfig.allowProperties()) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "共享策略未授权读取设备最新属性");
        }

        DeviceBasicVO device = requirePolicyDevice(policy, deviceId);
        List<DeviceTelemetrySnapshotDTO> snapshots = unwrapList(
                deviceDataClient.querySharedLatest(deviceId, policy.getOwnerTenantId()),
                "读取共享设备最新属性失败"
        );
        applyMasking(policy, snapshots);
        recordAudit(policy, "QUERY_PROPERTIES", buildQueryDetail(policyId, device, Map.of()), snapshots.size(), ipAddress);
        return snapshots;
    }

    public List<DeviceTelemetryPointDTO> querySharedTelemetry(Long policyId,
                                                              Long deviceId,
                                                              String property,
                                                              String startTime,
                                                              String endTime,
                                                              Integer limit,
                                                              String ipAddress) {
        SharePolicy policy = getApprovedConsumedPolicyOrThrow(policyId);
        SharePolicyRuleSupport.PermissionConfig permissionConfig = ruleSupport.parsePermissions(policy.getDataPermissions());
        if (!permissionConfig.allowTelemetry()) {
            throw new BizException(ResultCode.PERMISSION_DENIED, "共享策略未授权读取设备历史遥测");
        }

        DeviceBasicVO device = requirePolicyDevice(policy, deviceId);
        SharedDeviceTelemetryQueryDTO query = new SharedDeviceTelemetryQueryDTO();
        query.setOwnerTenantId(policy.getOwnerTenantId());
        query.setDeviceId(deviceId);
        query.setProperty(property);
        query.setStartTime(normalizeStartTime(permissionConfig, startTime));
        query.setEndTime(endTime);
        query.setLimit(limit == null || limit <= 0 ? 100 : limit);

        List<DeviceTelemetryPointDTO> points = unwrapList(
                deviceDataClient.querySharedTelemetry(query),
                "读取共享设备历史遥测失败"
        );
        applyMasking(policy, points);

        Map<String, Object> detail = new LinkedHashMap<>();
        if (property != null && !property.isBlank()) {
            detail.put("property", property);
        }
        if (query.getStartTime() != null) {
            detail.put("startTime", query.getStartTime());
        }
        if (endTime != null && !endTime.isBlank()) {
            detail.put("endTime", endTime);
        }
        detail.put("limit", query.getLimit());
        recordAudit(policy, "QUERY_TELEMETRY", buildQueryDetail(policyId, device, detail), points.size(), ipAddress);
        return points;
    }

    private List<SharedDeviceVO> resolvePolicyDevices(SharePolicy policy, boolean failOnInvalidPolicy, String ipAddress) {
        SharePolicyRuleSupport.ScopeSelectors selectors = ruleSupport.parseScope(policy.getScope());
        if (selectors.isEmpty()) {
            if (failOnInvalidPolicy) {
                throw new BizException(ResultCode.PARAM_ERROR, "共享策略未配置可解析的共享范围");
            }
            return List.of();
        }

        SharedDeviceResolveRequestDTO request = new SharedDeviceResolveRequestDTO();
        request.setOwnerTenantId(policy.getOwnerTenantId());
        request.setScope(policy.getScope());
        List<DeviceBasicVO> devices = unwrapList(deviceClient.resolveSharedDevices(request), "解析共享设备失败");
        recordAudit(policy, "QUERY_DEVICES", buildQueryDetail(policy.getId(), null, Map.of()), devices.size(), ipAddress);

        List<SharedDeviceVO> result = new ArrayList<>(devices.size());
        for (DeviceBasicVO device : devices) {
            if (!policy.getOwnerTenantId().equals(device.getTenantId()) || !selectors.matches(device)) {
                continue;
            }
            SharedDeviceVO vo = new SharedDeviceVO();
            vo.setPolicyId(policy.getId());
            vo.setPolicyName(policy.getName());
            vo.setOwnerTenantId(policy.getOwnerTenantId());
            vo.setDeviceId(device.getId());
            vo.setDeviceName(device.getDeviceName());
            vo.setNickname(device.getNickname());
            vo.setProductId(device.getProductId());
            vo.setProductKey(device.getProductKey());
            vo.setProductName(device.getProductName());
            vo.setStatus(device.getStatus());
            vo.setOnlineStatus(device.getOnlineStatus());
            result.add(vo);
        }
        return result;
    }

    private DeviceBasicVO requirePolicyDevice(SharePolicy policy, Long deviceId) {
        if (deviceId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "共享设备编号不能为空");
        }
        DeviceBasicVO device = unwrapSingle(deviceClient.getDeviceBasic(deviceId), "查询共享设备失败");
        if (!policy.getOwnerTenantId().equals(device.getTenantId())) {
            throw new BizException(ResultCode.NOT_FOUND, "共享设备不存在");
        }
        SharePolicyRuleSupport.ScopeSelectors selectors = ruleSupport.parseScope(policy.getScope());
        if (selectors.isEmpty() || !selectors.matches(device)) {
            throw new BizException(ResultCode.NOT_FOUND, "共享设备不存在");
        }
        return device;
    }

    private SharePolicy getApprovedConsumedPolicyOrThrow(Long policyId) {
        SharePolicy policy = policyMapper.selectById(policyId);
        if (policy == null) {
            throw new BizException(ResultCode.NOT_FOUND, "共享策略不存在");
        }
        Long tenantId = requireCurrentTenantId();
        if (!tenantId.equals(policy.getConsumerTenantId()) || policy.getStatus() != ShareStatus.APPROVED) {
            throw new BizException(ResultCode.NOT_FOUND, "共享策略不存在");
        }
        return policy;
    }

    private Long requireCurrentTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "租户上下文缺失");
        }
        return tenantId;
    }

    private String normalizeStartTime(SharePolicyRuleSupport.PermissionConfig permissionConfig, String startTime) {
        Integer maxHistoryDays = permissionConfig.maxHistoryDays();
        if (maxHistoryDays == null || maxHistoryDays <= 0) {
            return startTime;
        }
        LocalDateTime earliestAllowed = LocalDateTime.now().minusDays(maxHistoryDays);
        LocalDateTime requestedStart = ruleSupport.parseDateTime(startTime, "startTime");
        if (requestedStart == null || requestedStart.isBefore(earliestAllowed)) {
            return ruleSupport.formatDateTime(earliestAllowed);
        }
        return startTime;
    }

    private void applyMasking(SharePolicy policy, List<? extends Object> payload) {
        Map<String, String> rules = ruleSupport.parseMaskingRules(policy.getMaskingRules());
        if (rules.isEmpty() || payload == null || payload.isEmpty()) {
            return;
        }
        for (Object item : payload) {
            if (item instanceof DeviceTelemetrySnapshotDTO snapshot) {
                applyValueMask(rules.get(snapshot.getProperty()), snapshot);
            } else if (item instanceof DeviceTelemetryPointDTO point) {
                applyValueMask(rules.get(point.getProperty()), point);
            }
        }
    }

    private void applyValueMask(String strategy, DeviceTelemetrySnapshotDTO target) {
        if (strategy == null) {
            return;
        }
        ValueMask masked = applyValueMask(strategy, target.getValueNumber(), target.getValueString(), target.getValueBool());
        target.setValueNumber(masked.valueNumber());
        target.setValueString(masked.valueString());
        target.setValueBool(masked.valueBool());
    }

    private void applyValueMask(String strategy, DeviceTelemetryPointDTO target) {
        if (strategy == null) {
            return;
        }
        ValueMask masked = applyValueMask(strategy, target.getValueNumber(), target.getValueString(), target.getValueBool());
        target.setValueNumber(masked.valueNumber());
        target.setValueString(masked.valueString());
        target.setValueBool(masked.valueBool());
    }

    private ValueMask applyValueMask(String strategy, Double valueNumber, String valueString, Boolean valueBool) {
        return switch (strategy) {
            case "MASK_ALL" -> new ValueMask(null, "******", null);
            case "MASK_MIDDLE" -> new ValueMask(null, maskMiddle(resolveTextValue(valueNumber, valueString, valueBool)), null);
            default -> {
                if (strategy.startsWith("ROUND_") && valueNumber != null) {
                    int scale = parseRoundScale(strategy);
                    yield new ValueMask(round(valueNumber, scale), valueString, valueBool);
                }
                yield new ValueMask(valueNumber, valueString, valueBool);
            }
        };
    }

    private int parseRoundScale(String strategy) {
        try {
            return Integer.parseInt(strategy.substring("ROUND_".length()));
        } catch (NumberFormatException ex) {
            return 2;
        }
    }

    private Double round(Double value, int scale) {
        return BigDecimal.valueOf(value)
                .setScale(Math.max(scale, 0), RoundingMode.HALF_UP)
                .doubleValue();
    }

    private String resolveTextValue(Double valueNumber, String valueString, Boolean valueBool) {
        if (valueString != null) {
            return valueString;
        }
        if (valueNumber != null) {
            return BigDecimal.valueOf(valueNumber).stripTrailingZeros().toPlainString();
        }
        if (valueBool != null) {
            return valueBool.toString();
        }
        return "";
    }

    private String maskMiddle(String rawValue) {
        if (rawValue == null || rawValue.isBlank()) {
            return "******";
        }
        if (rawValue.length() <= 4) {
            return "****";
        }
        int prefix = Math.max(1, rawValue.length() / 4);
        int suffix = Math.max(1, rawValue.length() / 4);
        if (prefix + suffix >= rawValue.length()) {
            return "****";
        }
        return rawValue.substring(0, prefix) + "****" + rawValue.substring(rawValue.length() - suffix);
    }

    private String buildQueryDetail(Long policyId, DeviceBasicVO device, Map<String, Object> extra) {
        Map<String, Object> detail = new LinkedHashMap<>();
        detail.put("policyId", policyId);
        if (device != null) {
            detail.put("deviceId", device.getId());
            detail.put("deviceName", device.getDeviceName());
            detail.put("productKey", device.getProductKey());
        }
        detail.putAll(extra);
        return ruleSupport.toJson(detail);
    }

    private void recordAudit(SharePolicy policy, String action, String queryDetail, Integer resultCount, String ipAddress) {
        if (policy == null || Boolean.FALSE.equals(policy.getAuditEnabled())) {
            return;
        }
        ShareAuditLog auditLog = new ShareAuditLog();
        auditLog.setPolicyId(policy.getId());
        auditLog.setConsumerTenantId(policy.getConsumerTenantId());
        auditLog.setAction(action);
        auditLog.setQueryDetail(queryDetail);
        auditLog.setResultCount(resultCount);
        auditLog.setIpAddress(ipAddress);
        auditLog.setCreatedAt(LocalDateTime.now());
        auditLogMapper.insert(auditLog);
    }

    private <T> T unwrapSingle(R<T> response, String fallbackMessage) {
        if (response == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, fallbackMessage);
        }
        if (response.getCode() != ResultCode.SUCCESS.getCode()) {
            throw new BizException(response.getCode(), response.getMessage());
        }
        if (response.getData() == null) {
            throw new BizException(ResultCode.NOT_FOUND, fallbackMessage);
        }
        return response.getData();
    }

    private <T> List<T> unwrapList(R<List<T>> response, String fallbackMessage) {
        if (response == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, fallbackMessage);
        }
        if (response.getCode() != ResultCode.SUCCESS.getCode()) {
            throw new BizException(response.getCode(), response.getMessage());
        }
        return response.getData() == null ? List.of() : response.getData();
    }

    private record ValueMask(Double valueNumber, String valueString, Boolean valueBool) {
    }
}
