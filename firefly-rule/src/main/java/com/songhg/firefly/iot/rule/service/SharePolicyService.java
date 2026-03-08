package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.enums.ShareStatus;
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
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class SharePolicyService {

    private final SharePolicyMapper policyMapper;
    private final ShareAuditLogMapper auditLogMapper;

    public List<SharePolicyVO> listOwned() {
        Long tenantId = TenantContextHolder.getTenantId();
        LambdaQueryWrapper<SharePolicy> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SharePolicy::getOwnerTenantId, tenantId)
                .orderByDesc(SharePolicy::getCreatedAt);
        return policyMapper.selectList(wrapper)
                .stream().map(ShareConvert.INSTANCE::toPolicyVO).collect(Collectors.toList());
    }

    public List<SharePolicyVO> listConsumed() {
        Long tenantId = TenantContextHolder.getTenantId();
        LambdaQueryWrapper<SharePolicy> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(SharePolicy::getConsumerTenantId, tenantId)
                .eq(SharePolicy::getStatus, ShareStatus.APPROVED)
                .orderByDesc(SharePolicy::getCreatedAt);
        return policyMapper.selectList(wrapper)
                .stream().map(ShareConvert.INSTANCE::toPolicyVO).collect(Collectors.toList());
    }

    public SharePolicyVO getById(Long id) {
        SharePolicy policy = policyMapper.selectById(id);
        return policy != null ? ShareConvert.INSTANCE.toPolicyVO(policy) : null;
    }

    @Transactional
    public SharePolicyVO create(SharePolicyCreateDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();
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
        policy.setCreatedBy(UserContextHolder.getUserId());
        policy.setCreatedAt(LocalDateTime.now());
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.insert(policy);
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    @Transactional
    public SharePolicyVO update(Long id, SharePolicyCreateDTO dto) {
        SharePolicy policy = policyMapper.selectById(id);
        if (policy == null) return null;

        if (dto.getName() != null) policy.setName(dto.getName());
        if (dto.getScope() != null) policy.setScope(dto.getScope());
        if (dto.getDataPermissions() != null) policy.setDataPermissions(dto.getDataPermissions());
        if (dto.getMaskingRules() != null) policy.setMaskingRules(dto.getMaskingRules());
        if (dto.getRateLimit() != null) policy.setRateLimit(dto.getRateLimit());
        if (dto.getValidity() != null) policy.setValidity(dto.getValidity());
        if (dto.getAuditEnabled() != null) policy.setAuditEnabled(dto.getAuditEnabled());
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    public void delete(Long id) {
        policyMapper.deleteById(id);
    }

    @Transactional
    public SharePolicyVO approve(Long id) {
        SharePolicy policy = policyMapper.selectById(id);
        if (policy == null || policy.getStatus() != ShareStatus.PENDING) return null;
        policy.setStatus(ShareStatus.APPROVED);
        policy.setApprovedBy(UserContextHolder.getUserId());
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    @Transactional
    public SharePolicyVO reject(Long id) {
        SharePolicy policy = policyMapper.selectById(id);
        if (policy == null || policy.getStatus() != ShareStatus.PENDING) return null;
        policy.setStatus(ShareStatus.REJECTED);
        policy.setApprovedBy(UserContextHolder.getUserId());
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    @Transactional
    public SharePolicyVO revoke(Long id) {
        SharePolicy policy = policyMapper.selectById(id);
        if (policy == null || policy.getStatus() != ShareStatus.APPROVED) return null;
        policy.setStatus(ShareStatus.REVOKED);
        policy.setUpdatedAt(LocalDateTime.now());
        policyMapper.updateById(policy);
        return ShareConvert.INSTANCE.toPolicyVO(policy);
    }

    public IPage<ShareAuditLogVO> listAuditLogs(ShareAuditLogQueryDTO query) {
        Page<ShareAuditLog> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ShareAuditLog> wrapper = new LambdaQueryWrapper<>();
        if (query.getPolicyId() != null) {
            wrapper.eq(ShareAuditLog::getPolicyId, query.getPolicyId());
        }
        wrapper.orderByDesc(ShareAuditLog::getCreatedAt);
        IPage<ShareAuditLog> result = auditLogMapper.selectPage(page, wrapper);
        return result.convert(ShareConvert.INSTANCE::toAuditLogVO);
    }
}
