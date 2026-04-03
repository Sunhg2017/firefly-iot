package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ShareStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.dto.share.ShareAuditLogQueryDTO;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyCreateDTO;
import com.songhg.firefly.iot.rule.entity.SharePolicy;
import com.songhg.firefly.iot.rule.mapper.ShareAuditLogMapper;
import com.songhg.firefly.iot.rule.mapper.SharePolicyMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SharePolicyServiceTest {

    @Mock
    private SharePolicyMapper policyMapper;

    @Mock
    private ShareAuditLogMapper auditLogMapper;

    private SharePolicyService sharePolicyService;

    @BeforeEach
    void setUp() {
        AppContextHolder.setTenantId(1001L);
        AppContextHolder.setUserId(501L);
        sharePolicyService = new SharePolicyService(
                policyMapper,
                auditLogMapper,
                new SharePolicyRuleSupport(new ObjectMapper())
        );
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void shouldRejectPolicyDetailForInvisibleTenant() {
        SharePolicy policy = new SharePolicy();
        policy.setId(9L);
        policy.setOwnerTenantId(2001L);
        policy.setConsumerTenantId(2002L);
        policy.setStatus(ShareStatus.APPROVED);

        when(policyMapper.selectById(9L)).thenReturn(policy);

        BizException ex = assertThrows(BizException.class, () -> sharePolicyService.getById(9L));

        assertEquals(ResultCode.NOT_FOUND.getCode(), ex.getCode());
    }

    @Test
    void shouldRejectUpdatingApprovedPolicy() {
        SharePolicy policy = buildOwnedPolicy(11L, ShareStatus.APPROVED);
        when(policyMapper.selectById(11L)).thenReturn(policy);

        BizException ex = assertThrows(BizException.class, () -> sharePolicyService.update(11L, buildValidDto()));

        assertEquals(ResultCode.CONFLICT.getCode(), ex.getCode());
        verify(policyMapper, never()).updateById(any(SharePolicy.class));
    }

    @Test
    void shouldRejectSelfTargetedPolicyCreation() {
        SharePolicyCreateDTO dto = buildValidDto();
        dto.setConsumerTenantId(1001L);

        BizException ex = assertThrows(BizException.class, () -> sharePolicyService.create(dto));

        assertEquals(ResultCode.PARAM_ERROR.getCode(), ex.getCode());
        verify(policyMapper, never()).insert(any(SharePolicy.class));
    }

    @Test
    void shouldRejectAuditLogQueryForInvisiblePolicy() {
        SharePolicy policy = new SharePolicy();
        policy.setId(19L);
        policy.setOwnerTenantId(3001L);
        policy.setConsumerTenantId(3002L);
        policy.setStatus(ShareStatus.APPROVED);
        when(policyMapper.selectById(19L)).thenReturn(policy);

        ShareAuditLogQueryDTO query = new ShareAuditLogQueryDTO();
        query.setPolicyId(19L);

        BizException ex = assertThrows(BizException.class, () -> sharePolicyService.listAuditLogs(query));

        assertEquals(ResultCode.NOT_FOUND.getCode(), ex.getCode());
        verify(auditLogMapper, never()).selectPage(any(), any(LambdaQueryWrapper.class));
    }

    private SharePolicy buildOwnedPolicy(Long id, ShareStatus status) {
        SharePolicy policy = new SharePolicy();
        policy.setId(id);
        policy.setOwnerTenantId(1001L);
        policy.setConsumerTenantId(2002L);
        policy.setStatus(status);
        policy.setAuditEnabled(true);
        return policy;
    }

    private SharePolicyCreateDTO buildValidDto() {
        SharePolicyCreateDTO dto = new SharePolicyCreateDTO();
        dto.setName("共享温度数据");
        dto.setConsumerTenantId(2002L);
        dto.setScope("""
                {"productKeys":["pk-meter"],"deviceNames":["meter-01"]}
                """);
        dto.setDataPermissions("""
                {"properties":true,"telemetry":true}
                """);
        return dto;
    }
}
