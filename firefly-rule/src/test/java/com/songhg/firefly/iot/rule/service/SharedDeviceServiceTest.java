package com.songhg.firefly.iot.rule.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.DeviceClient;
import com.songhg.firefly.iot.api.client.DeviceDataClient;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.api.dto.DeviceTelemetrySnapshotDTO;
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
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SharedDeviceServiceTest {

    @Mock
    private SharePolicyMapper policyMapper;

    @Mock
    private ShareAuditLogMapper auditLogMapper;

    @Mock
    private DeviceClient deviceClient;

    @Mock
    private DeviceDataClient deviceDataClient;

    private SharedDeviceService sharedDeviceService;

    @BeforeEach
    void setUp() {
        AppContextHolder.setTenantId(2002L);
        AppContextHolder.setUserId(801L);
        sharedDeviceService = new SharedDeviceService(
                policyMapper,
                auditLogMapper,
                new SharePolicyRuleSupport(new ObjectMapper()),
                deviceClient,
                deviceDataClient
        );
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void shouldListDevicesByApprovedPolicyScope() {
        SharePolicy policy = buildApprovedPolicy();
        DeviceBasicVO device = buildDevice();

        when(policyMapper.selectById(7L)).thenReturn(policy);
        when(deviceClient.resolveSharedDevices(any())).thenReturn(R.ok(List.of(device)));

        List<SharedDeviceVO> result = sharedDeviceService.listSharedDevices(7L, "10.0.0.8");

        assertEquals(1, result.size());
        assertEquals(7L, result.getFirst().getPolicyId());
        assertEquals(31L, result.getFirst().getDeviceId());
        verify(auditLogMapper).insert(any(ShareAuditLog.class));
    }

    @Test
    void shouldRejectLatestPropertyQueryWhenPermissionMissing() {
        SharePolicy policy = buildApprovedPolicy();
        policy.setDataPermissions("""
                {"properties":false,"telemetry":true}
                """);
        when(policyMapper.selectById(7L)).thenReturn(policy);

        BizException ex = assertThrows(BizException.class, () -> sharedDeviceService.querySharedLatest(7L, 31L, "10.0.0.8"));

        assertEquals(ResultCode.PERMISSION_DENIED.getCode(), ex.getCode());
    }

    @Test
    void shouldMaskLatestPropertyValues() {
        SharePolicy policy = buildApprovedPolicy();
        policy.setMaskingRules("""
                {"imei":"MASK_MIDDLE"}
                """);
        DeviceBasicVO device = buildDevice();
        DeviceTelemetrySnapshotDTO snapshot = new DeviceTelemetrySnapshotDTO();
        snapshot.setProperty("imei");
        snapshot.setValueString("123456789012345");

        when(policyMapper.selectById(7L)).thenReturn(policy);
        when(deviceClient.getDeviceBasic(31L)).thenReturn(R.ok(device));
        when(deviceDataClient.querySharedLatest(31L, 1001L)).thenReturn(R.ok(List.of(snapshot)));

        List<DeviceTelemetrySnapshotDTO> result = sharedDeviceService.querySharedLatest(7L, 31L, "10.0.0.8");

        assertEquals(1, result.size());
        assertEquals("123****345", result.getFirst().getValueString());
    }

    private SharePolicy buildApprovedPolicy() {
        SharePolicy policy = new SharePolicy();
        policy.setId(7L);
        policy.setOwnerTenantId(1001L);
        policy.setConsumerTenantId(2002L);
        policy.setStatus(ShareStatus.APPROVED);
        policy.setAuditEnabled(true);
        policy.setScope("""
                {"productKeys":["pk-meter"]}
                """);
        policy.setDataPermissions("""
                {"properties":true,"telemetry":true}
                """);
        return policy;
    }

    private DeviceBasicVO buildDevice() {
        DeviceBasicVO device = new DeviceBasicVO();
        device.setId(31L);
        device.setTenantId(1001L);
        device.setProductId(11L);
        device.setProductKey("pk-meter");
        device.setDeviceName("meter-01");
        return device;
    }
}
