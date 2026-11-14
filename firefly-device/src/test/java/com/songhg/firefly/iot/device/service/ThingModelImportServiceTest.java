package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.AsyncTaskClient;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.AsyncTaskCreateDTO;
import com.songhg.firefly.iot.api.dto.AsyncTaskVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.dto.product.ThingModelImportDTO;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ACC-006 回归：参数清单解析注册为异步任务，取消后不再下载解析。
 */
class ThingModelImportServiceTest {

    private final ProductMapper productMapper = mock(ProductMapper.class);
    private final FileClient fileClient = mock(FileClient.class);
    private final AsyncTaskClient asyncTaskClient = mock(AsyncTaskClient.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ThingModelBuiltinDefinitionSupport builtinDefinitionSupport = mock(ThingModelBuiltinDefinitionSupport.class);
    private final ImportTaskDispatcher importTaskDispatcher = mock(ImportTaskDispatcher.class);
    private final StringRedisTemplate redisTemplate = mock(StringRedisTemplate.class);
    @SuppressWarnings("unchecked")
    private final ValueOperations<String, String> valueOperations = mock(ValueOperations.class);
    private final ThingModelImportService service = new ThingModelImportService(
            productMapper, fileClient, asyncTaskClient, objectMapper, builtinDefinitionSupport,
            importTaskDispatcher, redisTemplate);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void registerParameterParseTaskReturnsTaskIdAndDispatches() {
        AppContextHolder.setTenantId(1L);
        AppContextHolder.setUserId(2L);
        Product product = new Product();
        product.setId(10L);
        product.setName("产品A");
        when(productMapper.selectById(10L)).thenReturn(product);
        AsyncTaskVO task = new AsyncTaskVO();
        task.setId(88L);
        when(asyncTaskClient.createTask(any(AsyncTaskCreateDTO.class))).thenReturn(R.ok(task));

        ThingModelImportDTO dto = new ThingModelImportDTO();
        dto.setFileKey("tenant/params.csv");
        dto.setFileFormat("CSV");
        Long taskId = service.registerParameterParseTask(10L, dto);

        assertEquals(88L, taskId);
        verify(importTaskDispatcher).dispatch(any());
    }

    @Test
    void cancelledParameterParseDoesNotDownload() {
        when(asyncTaskClient.updateProgress(anyLong(), anyInt())).thenReturn(R.ok(false));
        ThingModelImportDTO dto = new ThingModelImportDTO();
        dto.setFileKey("tenant/params.csv");
        dto.setFileFormat("CSV");

        service.executeParameterParse(88L, dto, 1L, 2L);

        verify(fileClient, never()).getPresignedUrl(anyString());
        verify(asyncTaskClient, never()).completeTask(anyLong(), any(Boolean.class), any(), any(), any(), any());
    }

    @Test
    void parseResultIsReadFromRedis() {
        when(redisTemplate.opsForValue()).thenReturn(valueOperations);
        when(valueOperations.get("thingmodel:parse:88")).thenReturn("[{\"name\":\"temperature\"}]");

        var rows = service.getParameterParseResult(88L);

        assertEquals(1, rows.size());
        assertEquals("temperature", rows.get(0).get("name"));
    }
}
