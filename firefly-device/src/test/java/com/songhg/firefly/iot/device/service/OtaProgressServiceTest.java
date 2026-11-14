package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.enums.FirmwareStatus;
import com.songhg.firefly.iot.common.enums.OtaDeviceStatus;
import com.songhg.firefly.iot.common.enums.OtaTaskStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.device.entity.Firmware;
import com.songhg.firefly.iot.device.entity.OtaTask;
import com.songhg.firefly.iot.device.entity.OtaTaskDevice;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.FirmwareMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskDeviceMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskMapper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OtaProgressServiceTest {

    private final OtaTaskMapper otaTaskMapper = mock(OtaTaskMapper.class);
    private final OtaTaskDeviceMapper otaTaskDeviceMapper = mock(OtaTaskDeviceMapper.class);
    private final OtaProgressService service = new OtaProgressService(otaTaskMapper, otaTaskDeviceMapper);

    @Test
    void successProgressMarksTaskCompleted() {
        OtaTaskDevice record = new OtaTaskDevice();
        record.setId(5L);
        record.setTaskId(9L);
        record.setDeviceId(1L);
        record.setStatus(OtaDeviceStatus.DOWNLOADING);
        when(otaTaskDeviceMapper.selectOne(any())).thenReturn(record);
        when(otaTaskDeviceMapper.selectList(any())).thenReturn(java.util.List.of(record));

        OtaTask task = new OtaTask();
        task.setId(9L);
        task.setStatus(OtaTaskStatus.IN_PROGRESS);
        when(otaTaskMapper.selectById(9L)).thenReturn(task);

        service.handleProgress(message(Map.of("taskId", 9, "progress", 100, "status", "SUCCESS")));

        assertEquals(OtaDeviceStatus.SUCCESS, record.getStatus());
        assertEquals(100, record.getProgress());
        verify(otaTaskDeviceMapper).updateById(record);
        assertEquals(OtaTaskStatus.COMPLETED, task.getStatus());
        assertEquals(1, task.getSuccessCount());
    }

    @Test
    void failureProgressMarksTaskFailedWhenNoSuccess() {
        OtaTaskDevice record = new OtaTaskDevice();
        record.setId(6L);
        record.setTaskId(10L);
        record.setDeviceId(2L);
        when(otaTaskDeviceMapper.selectOne(any())).thenReturn(record);
        when(otaTaskDeviceMapper.selectList(any())).thenReturn(java.util.List.of(record));

        OtaTask task = new OtaTask();
        task.setId(10L);
        task.setStatus(OtaTaskStatus.IN_PROGRESS);
        when(otaTaskMapper.selectById(10L)).thenReturn(task);

        service.handleProgress(message(Map.of("taskId", 10, "progress", 30, "status", "FAILED", "errorMessage", "flash error")));

        assertEquals(OtaDeviceStatus.FAILURE, record.getStatus());
        assertEquals("flash error", record.getErrorMessage());
        assertEquals(OtaTaskStatus.FAILED, task.getStatus());
        assertEquals(1, task.getFailureCount());
    }

    @Test
    void unknownTaskIsIgnored() {
        when(otaTaskDeviceMapper.selectList(any())).thenReturn(java.util.List.of());

        service.handleProgress(message(Map.of("progress", 10)));

        verify(otaTaskDeviceMapper, never()).updateById(any(OtaTaskDevice.class));
    }

    private DeviceMessage message(Map<String, Object> payload) {
        return DeviceMessage.builder()
                .deviceId(1L)
                .tenantId(1L)
                .productId(2L)
                .type(DeviceMessage.MessageType.OTA_PROGRESS)
                .payload(payload)
                .build();
    }
}
