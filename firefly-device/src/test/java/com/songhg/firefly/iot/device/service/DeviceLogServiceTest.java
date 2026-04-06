package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.MybatisConfiguration;
import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.core.metadata.TableInfoHelper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.api.dto.DeviceBasicVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogQueryParam;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogVO;
import com.songhg.firefly.iot.device.entity.DeviceLog;
import com.songhg.firefly.iot.device.mapper.DeviceLogMapper;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.apache.ibatis.builder.MapperBuilderAssistant;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DeviceLogServiceTest {

    private final DeviceLogMapper deviceLogMapper = mock(DeviceLogMapper.class);
    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final DeviceLogService service = new DeviceLogService(deviceLogMapper, deviceMapper);

    @BeforeAll
    static void initTableInfo() {
        MapperBuilderAssistant assistant = new MapperBuilderAssistant(new MybatisConfiguration(), "");
        assistant.setCurrentNamespace("DeviceLogServiceTest");
        TableInfoHelper.initTableInfo(assistant, DeviceLog.class);
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void recordShouldKeepReportedAtAndNormalizeLevel() {
        LocalDateTime reportedAt = LocalDateTime.of(2026, 4, 6, 9, 30, 0);
        DeviceLog logRecord = new DeviceLog();
        logRecord.setDeviceId(1001L);
        logRecord.setLevel("warn");
        logRecord.setReportedAt(reportedAt);
        logRecord.setContent("low battery");

        service.record(logRecord);

        assertEquals("WARN", logRecord.getLevel());
        assertEquals(reportedAt, logRecord.getReportedAt());
        assertNotNull(logRecord.getCreatedAt());
        verify(deviceLogMapper).insert(logRecord);
    }

    @Test
    void listLogsShouldEnrichReadableDeviceFields() {
        AppContextHolder.setTenantId(21L);

        DeviceLog logRecord = buildLog(11L, 21L, 301L, 401L);
        Page<DeviceLog> page = new Page<>(1, 20, 1);
        page.setRecords(List.of(logRecord));

        DeviceBasicVO deviceBasic = buildDeviceBasic(301L, 21L, "sensor-301", "仓储温度计", "temp-sensor", "温度传感器");

        when(deviceLogMapper.selectPage(any(Page.class), any(LambdaQueryWrapper.class))).thenReturn(page);
        when(deviceMapper.selectBasicByIdsIgnoreTenant(List.of(301L))).thenReturn(List.of(deviceBasic));

        DeviceLogQueryParam query = new DeviceLogQueryParam();
        query.setPageNum(1);
        query.setPageSize(20);

        IPage<DeviceLogVO> result = service.listLogs(query);

        assertEquals(1, result.getRecords().size());
        DeviceLogVO first = result.getRecords().get(0);
        assertEquals("sensor-301", first.getDeviceName());
        assertEquals("仓储温度计", first.getNickname());
        assertEquals("temp-sensor", first.getProductKey());
        assertEquals("温度传感器", first.getProductName());

        ArgumentCaptor<LambdaQueryWrapper<DeviceLog>> wrapperCaptor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(deviceLogMapper).selectPage(any(Page.class), wrapperCaptor.capture());
        String sqlSegment = wrapperCaptor.getValue().getSqlSegment().toLowerCase();
        assertTrue(sqlSegment.contains("tenant_id"));
        assertTrue(sqlSegment.contains("reported_at"));
    }

    @Test
    void getRecentLogsShouldFilterByTenantAndReturnReadableFields() {
        AppContextHolder.setTenantId(22L);

        DeviceLog logRecord = buildLog(12L, 22L, 302L, 402L);
        DeviceBasicVO deviceBasic = buildDeviceBasic(302L, 22L, "gateway-302", "边缘网关", "edge-gw", "边缘产品");

        when(deviceLogMapper.selectList(any(LambdaQueryWrapper.class))).thenReturn(List.of(logRecord));
        when(deviceMapper.selectBasicByIdsIgnoreTenant(List.of(302L))).thenReturn(List.of(deviceBasic));

        List<DeviceLogVO> result = service.getRecentLogs(302L, -5);

        assertEquals(1, result.size());
        assertEquals("gateway-302", result.get(0).getDeviceName());
        assertEquals("edge-gw", result.get(0).getProductKey());

        ArgumentCaptor<LambdaQueryWrapper<DeviceLog>> wrapperCaptor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(deviceLogMapper).selectList(wrapperCaptor.capture());
        String sqlSegment = wrapperCaptor.getValue().getSqlSegment().toLowerCase();
        assertTrue(sqlSegment.contains("tenant_id"));
        assertTrue(sqlSegment.contains("device_id"));
        assertTrue(sqlSegment.contains("limit 100"));
    }

    @Test
    void countByLevelShouldNormalizeLevelAndFilterTenant() {
        AppContextHolder.setTenantId(23L);
        when(deviceLogMapper.selectCount(any(LambdaQueryWrapper.class))).thenReturn(7L);

        long count = service.countByLevel(303L, "error");

        assertEquals(7L, count);

        ArgumentCaptor<LambdaQueryWrapper<DeviceLog>> wrapperCaptor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(deviceLogMapper).selectCount(wrapperCaptor.capture());
        String sqlSegment = wrapperCaptor.getValue().getSqlSegment().toLowerCase();
        assertTrue(sqlSegment.contains("tenant_id"));
        assertTrue(sqlSegment.contains("device_id"));
        assertTrue(sqlSegment.contains("level"));
        assertTrue(wrapperCaptor.getValue().getParamNameValuePairs().values().contains("ERROR"));
    }

    @Test
    void cleanExpiredLogsShouldFallbackToDefaultRetentionAndFilterTenant() {
        AppContextHolder.setTenantId(24L);
        when(deviceLogMapper.delete(any(LambdaQueryWrapper.class))).thenReturn(3);

        LocalDateTime beforeCall = LocalDateTime.now();
        int deleted = service.cleanExpiredLogs(0);
        LocalDateTime afterCall = LocalDateTime.now();

        assertEquals(3, deleted);

        ArgumentCaptor<LambdaQueryWrapper<DeviceLog>> wrapperCaptor = ArgumentCaptor.forClass(LambdaQueryWrapper.class);
        verify(deviceLogMapper).delete(wrapperCaptor.capture());
        String sqlSegment = wrapperCaptor.getValue().getSqlSegment().toLowerCase();
        assertTrue(sqlSegment.contains("tenant_id"));
        assertTrue(sqlSegment.contains("created_at"));

        Map<String, Object> params = wrapperCaptor.getValue().getParamNameValuePairs();
        LocalDateTime threshold = params.values().stream()
                .filter(LocalDateTime.class::isInstance)
                .map(LocalDateTime.class::cast)
                .findFirst()
                .orElseThrow();
        LocalDateTime minExpected = beforeCall.minusDays(30);
        LocalDateTime maxExpected = afterCall.minusDays(30);
        assertTrue(!threshold.isBefore(minExpected) && !threshold.isAfter(maxExpected),
                "threshold should fall within the default 30-day retention window");
    }

    private DeviceLog buildLog(Long id, Long tenantId, Long deviceId, Long productId) {
        DeviceLog logRecord = new DeviceLog();
        logRecord.setId(id);
        logRecord.setTenantId(tenantId);
        logRecord.setDeviceId(deviceId);
        logRecord.setProductId(productId);
        logRecord.setLevel("INFO");
        logRecord.setModule("runtime");
        logRecord.setContent("device online");
        logRecord.setTraceId("trace-001");
        logRecord.setIp("192.168.10.20");
        logRecord.setReportedAt(LocalDateTime.of(2026, 4, 6, 10, 0, 0));
        logRecord.setCreatedAt(LocalDateTime.of(2026, 4, 6, 10, 0, 1));
        return logRecord;
    }

    private DeviceBasicVO buildDeviceBasic(
            Long id,
            Long tenantId,
            String deviceName,
            String nickname,
            String productKey,
            String productName) {
        DeviceBasicVO basic = new DeviceBasicVO();
        basic.setId(id);
        basic.setTenantId(tenantId);
        basic.setDeviceName(deviceName);
        basic.setNickname(nickname);
        basic.setProductKey(productKey);
        basic.setProductName(productName);
        return basic;
    }
}
