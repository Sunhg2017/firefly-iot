package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ShareStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.convert.ShareConvert;
import com.songhg.firefly.iot.rule.dto.share.ShareAuditLogQueryDTO;
import com.songhg.firefly.iot.rule.dto.share.ShareAuditLogVO;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyCreateDTO;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyVO;
import com.songhg.firefly.iot.rule.entity.ShareAuditLog;
import com.songhg.firefly.iot.rule.entity.SharePolicy;
import com.songhg.firefly.iot.rule.mapper.ShareAuditLogMapper;
import com.songhg.firefly.iot.rule.mapper.SharePolicyMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SharePolicyService {

    private final SharePolicyMapper policyMapper;
    private final ShareAuditLogMapper auditLogMapper;
    private final SharePolicyRuleSupport ruleSupport;

    public List<SharePolicyVO> listOwned() {
        Long tenantId = requireCurrentTenantId();
        LambdaQueryWrapper<SharePolicy> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SharePolicy::getOwnerTenantId, tenantId)
                .orderByDesc(SharePolicy::getCreatedAt);
        return policyMapper.selectList(wrapper)
                .stream()
                .map(ShareConvert.INSTANCE::toPolicyVO)
                .collect(Collectors.toList());
    }

    public List<SharePolicyVO> listConsumed() {
        Long tenantId = requireCurrentTenantId();
        LambdaQueryWrapper<SharePolicy> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SharePolicy::getConsumerTenantId, tenantId)
                .eq(SharePolicy::getStatus, ShareStatus.APPROVED)
                .orderByDesc(SharePolicy::getCreatedAt);
        return policyMapper.selectList(wrapper)
                .stream()
                .map(ShareConvert.INSTANCE::toPolicyVO)
                .collect(Collectors.toList());
    }

    public SharePolicyVO getById(Long id) {
        return ShareConvert.INSTANCE.toPolicyVO(getVisiblePolicyOrThrow(id));
    }

    @Transactional
    public SharePolicyVO create(SharePolicyCreateDTO dto) {
        Long tenantId = requireCurrentTenantId();
        ruleSupport.validatePolicyMutation(tenantId, dto);

        SharePolicy policy = new SharePolicy();
        policy.setOwnerTenantId(tenantId);
        policy.setConsumerTenantId(dto.getConsumerTenantId());
        policy.setName(dto.getName());
        policy.setScope(dto.getScope());
        policy.setDataPermissions(dto.getDataPermissions());
        policy.setMaskingRules(dto.getMaskingRules());
        policy.setRateLimit(dto.getRateLimit());
        policy.setValidity(dto.getValidity());
        policy.setStatus(ShareStatus.PENDING);
        policy.setAuditEnabled(dto.getAuditEnabled() != null ? dto.getAuditEnabled() : true);
        policy.setCreatedBy(AppContextHolder.getUserId());
        policy.setCreatedAt(LocalDateTime.now());
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.insert(policy);
        recordAudit(policy, "POLICY_CREATE", ruleSupport.toJson(Map.of("status", policy.getStatus().name())));
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    @Transactional
    public SharePolicyVO update(Long id, SharePolicyCreateDTO dto) {
        SharePolicy policy = getOwnedPolicyOrThrow(id);
        ensureNotApproved(policy, "已生效共享策略请先撤销后再修改");
        ruleSupport.validatePolicyMutation(policy.getOwnerTenantId(), dto);

        if (dto.getName() != null) {
            policy.setName(dto.getName());
        }
        if (dto.getConsumerTenantId() != null) {
            policy.setConsumerTenantId(dto.getConsumerTenantId());
        }
        if (dto.getScope() != null) {
            policy.setScope(dto.getScope());
        }
        if (dto.getDataPermissions() != null) {
            policy.setDataPermissions(dto.getDataPermissions());
        }
        if (dto.getMaskingRules() != null) {
            policy.setMaskingRules(dto.getMaskingRules());
        }
        if (dto.getRateLimit() != null) {
            policy.setRateLimit(dto.getRateLimit());
        }
        if (dto.getValidity() != null) {
            policy.setValidity(dto.getValidity());
        }
        if (dto.getAuditEnabled() != null) {
            policy.setAuditEnabled(dto.getAuditEnabled());
        }
        policy.setApprovedBy(null);
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        recordAudit(policy, "POLICY_UPDATE", ruleSupport.toJson(Map.of("status", policy.getStatus().name())));
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    @Transactional
    public void delete(Long id) {
        SharePolicy policy = getOwnedPolicyOrThrow(id);
        ensureNotApproved(policy, "已生效共享策略请先撤销后再删除");
        policyMapper.deleteById(policy.getId());
        recordAudit(policy, "POLICY_DELETE", ruleSupport.toJson(Map.of("status", policy.getStatus().name())));
    }

    @Transactional
    public SharePolicyVO approve(Long id) {
        SharePolicy policy = getOwnedPolicyOrThrow(id);
        ensureStatus(policy, ShareStatus.PENDING, "只有待审批的共享策略才能通过");
        policy.setStatus(ShareStatus.APPROVED);
        policy.setApprovedBy(AppContextHolder.getUserId());
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        recordAudit(policy, "POLICY_APPROVE", ruleSupport.toJson(Map.of("status", policy.getStatus().name())));
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    @Transactional
    public SharePolicyVO reject(Long id) {
        SharePolicy policy = getOwnedPolicyOrThrow(id);
        ensureStatus(policy, ShareStatus.PENDING, "只有待审批的共享策略才能驳回");
        policy.setStatus(ShareStatus.REJECTED);
        policy.setApprovedBy(AppContextHolder.getUserId());
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        recordAudit(policy, "POLICY_REJECT", ruleSupport.toJson(Map.of("status", policy.getStatus().name())));
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    @Transactional
    public SharePolicyVO revoke(Long id) {
        SharePolicy policy = getOwnedPolicyOrThrow(id);
        ensureStatus(policy, ShareStatus.APPROVED, "只有已批准的共享策略才能撤销");
        policy.setStatus(ShareStatus.REVOKED);
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        recordAudit(policy, "POLICY_REVOKE", ruleSupport.toJson(Map.of("status", policy.getStatus().name())));
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    public IPage<ShareAuditLogVO> listAuditLogs(ShareAuditLogQueryDTO query) {
        Page<ShareAuditLog> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ShareAuditLog> wrapper = new LambdaQueryWrapper<>();
        if (query.getPolicyId() != null) {
            wrapper.eq(ShareAuditLog::getPolicyId, getVisiblePolicyOrThrow(query.getPolicyId()).getId());
        } else {
            List<Long> visiblePolicyIds = listVisiblePolicyIds(requireCurrentTenantId());
            if (visiblePolicyIds.isEmpty()) {
                page.setRecords(List.of());
                page.setTotal(0);
                return page.convert(ShareConvert.INSTANCE::toAuditLogVO);
            }
            wrapper.in(ShareAuditLog::getPolicyId, visiblePolicyIds);
        }
        wrapper.orderByDesc(ShareAuditLog::getCreatedAt);
        IPage<ShareAuditLog> result = auditLogMapper.selectPage(page, wrapper);
        return result.convert(ShareConvert.INSTANCE::toAuditLogVO);
    }

    private SharePolicy getVisiblePolicyOrThrow(Long id) {
        SharePolicy policy = policyMapper.selectById(id);
        if (policy == null) {
            throw new BizException(ResultCode.NOT_FOUND, "共享策略不存在");
        }
        Long tenantId = requireCurrentTenantId();
        boolean ownerVisible = tenantId.equals(policy.getOwnerTenantId());
        boolean consumerVisible = tenantId.equals(policy.getConsumerTenantId()) && policy.getStatus() == ShareStatus.APPROVED;
        if (!ownerVisible && !consumerVisible) {
            throw new BizException(ResultCode.NOT_FOUND, "共享策略不存在");
        }
        return policy;
    }

    private SharePolicy getOwnedPolicyOrThrow(Long id) {
        SharePolicy policy = policyMapper.selectById(id);
        if (policy == null) {
            throw new BizException(ResultCode.NOT_FOUND, "共享策略不存在");
        }
        Long tenantId = requireCurrentTenantId();
        if (!tenantId.equals(policy.getOwnerTenantId())) {
            throw new BizException(ResultCode.NOT_FOUND, "共享策略不存在");
        }
        return policy;
    }

    private List<Long> listVisiblePolicyIds(Long tenantId) {
        LambdaQueryWrapper<SharePolicy> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SharePolicy::getOwnerTenantId, tenantId)
                .or(inner -> inner.eq(SharePolicy::getConsumerTenantId, tenantId)
                        .eq(SharePolicy::getStatus, ShareStatus.APPROVED));
        return policyMapper.selectList(wrapper)
                .stream()
                .map(SharePolicy::getId)
                .toList();
    }

    private void ensureStatus(SharePolicy policy, ShareStatus expectedStatus, String message) {
        if (policy.getStatus() != expectedStatus) {
            throw new BizException(ResultCode.CONFLICT, message);
        }
    }

    private void ensureNotApproved(SharePolicy policy, String message) {
        if (policy.getStatus() == ShareStatus.APPROVED) {
            throw new BizException(ResultCode.CONFLICT, message);
        }
    }

    private void recordAudit(SharePolicy policy, String action, String queryDetail) {
        if (policy == null || Boolean.FALSE.equals(policy.getAuditEnabled())) {
            return;
        }
        ShareAuditLog logEntry = new ShareAuditLog();
        logEntry.setPolicyId(policy.getId());
        logEntry.setConsumerTenantId(policy.getConsumerTenantId());
        logEntry.setAction(action);
        logEntry.setQueryDetail(queryDetail);
        logEntry.setCreatedAt(LocalDateTime.now());
        auditLogMapper.insert(logEntry);
    }

    private Long requireCurrentTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "租户上下文缺失");
        }
        return tenantId;
    }
}
