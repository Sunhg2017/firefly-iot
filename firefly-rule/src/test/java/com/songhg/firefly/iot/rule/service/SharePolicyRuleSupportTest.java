package com.songhg.firefly.iot.rule.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyCreateDTO;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SharePolicyRuleSupportTest {

    private final SharePolicyRuleSupport support = new SharePolicyRuleSupport(new ObjectMapper());

    @Test
    void shouldParseEventsPermissionAndHistoryDays() {
        SharePolicyRuleSupport.PermissionConfig config = support.parsePermissions("""
                {"properties":true,"telemetry":true,"events":true,"telemetryHistory":{"enabled":true,"maxDays":7}}
                """);

        assertTrue(config.allowProperties());
        assertTrue(config.allowTelemetry());
        assertTrue(config.allowEvents());
        assertEquals(7, config.maxHistoryDays());
    }

    @Test
    void shouldDefaultEventsPermissionToFalse() {
        SharePolicyRuleSupport.PermissionConfig config = support.parsePermissions("""
                {"properties":true,"telemetry":true}
                """);

        assertFalse(config.allowEvents());
    }

    @Test
    void shouldParseRateLimit() {
        SharePolicyRuleSupport.RateLimitConfig config = support.parseRateLimit("""
                {"qps":10,"dailyLimit":10000}
                """);

        assertEquals(10, config.qps());
        assertEquals(10000, config.dailyLimit());
        assertFalse(config.isEmpty());
    }

    @Test
    void shouldRejectNegativeRateLimit() {
        BizException ex = assertThrows(BizException.class,
                () -> support.parseRateLimit("{\"qps\":-1}"));

        assertEquals(ResultCode.PARAM_ERROR.getCode(), ex.getCode());
    }

    @Test
    void shouldEvaluateValidityWindow() {
        LocalDateTime now = LocalDateTime.now();
        SharePolicyRuleSupport.ValidityWindow active = support.parseValidity(
                "{\"startTime\":\"" + now.minusDays(1) + "\",\"endTime\":\"" + now.plusDays(1) + "\"}");
        SharePolicyRuleSupport.ValidityWindow expired = support.parseValidity(
                "{\"endTime\":\"" + now.minusDays(1) + "\"}");
        SharePolicyRuleSupport.ValidityWindow future = support.parseValidity(
                "{\"startTime\":\"" + now.plusDays(1) + "\"}");

        assertTrue(active.isEffectiveAt(now));
        assertFalse(expired.isEffectiveAt(now));
        assertFalse(future.isEffectiveAt(now));
    }

    @Test
    void shouldRejectValidityWithEndBeforeStart() {
        LocalDateTime now = LocalDateTime.now();
        BizException ex = assertThrows(BizException.class, () -> support.parseValidity(
                "{\"startTime\":\"" + now + "\",\"endTime\":\"" + now.minusDays(2) + "\"}"));

        assertEquals(ResultCode.PARAM_ERROR.getCode(), ex.getCode());
    }

    @Test
    void shouldMaskEventPayloadFields() {
        String masked = support.applyMaskingToPayload(
                "{\"imei\":\"123456789012345\",\"temperature\":23.456,\"status\":\"ok\"}",
                Map.of("imei", "MASK_MIDDLE", "temperature", "ROUND_1"));

        assertTrue(masked.contains("123****345"));
        assertTrue(masked.contains("23.5"));
        assertTrue(masked.contains("\"status\":\"ok\""));
    }

    @Test
    void shouldRejectPolicyMutationWithNegativeRateLimit() {
        SharePolicyCreateDTO dto = new SharePolicyCreateDTO();
        dto.setConsumerTenantId(2002L);
        dto.setScope("{\"productKeys\":[\"pk-meter\"]}");
        dto.setRateLimit("{\"dailyLimit\":-5}");

        BizException ex = assertThrows(BizException.class,
                () -> support.validatePolicyMutation(1001L, dto));

        assertEquals(ResultCode.PARAM_ERROR.getCode(), ex.getCode());
    }
}
