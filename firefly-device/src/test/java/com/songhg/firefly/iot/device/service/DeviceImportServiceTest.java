package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.api.client.AsyncTaskClient;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.AsyncTaskVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.dto.device.DeviceImportDTO;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

/**
 * ACC-005 回归：任务中心拒绝继续（已取消/已结束）时，导入线程不得再下载或解析文件。
 */
class DeviceImportServiceTest {

    private final DeviceService deviceService = mock(DeviceService.class);
    private final FileClient fileClient = mock(FileClient.class);
    private final AsyncTaskClient asyncTaskClient = mock(AsyncTaskClient.class);
    private final ImportTaskDispatcher importTaskDispatcher = mock(ImportTaskDispatcher.class);
    private final DeviceImportService service =
            new DeviceImportService(deviceService, fileClient, asyncTaskClient, importTaskDispatcher);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void cancelledTaskStopsBeforeDownload() {
        AppContextHolder.setTenantId(1L);
        AppContextHolder.setUserId(2L);
        when(asyncTaskClient.updateProgress(anyLong(), anyInt())).thenReturn(R.ok(false));
        DeviceImportDTO dto = new DeviceImportDTO();
        dto.setFileKey("tenant/file.csv");
        dto.setFileFormat("CSV");

        service.executeImport(99L, dto, 1L, 2L);

        verify(fileClient, never()).getPresignedUrl(anyString());
        verify(asyncTaskClient, never()).completeTask(anyLong(), any(Boolean.class), any(), any(), any(), any());
        verify(asyncTaskClient, never()).failTask(anyLong(), anyString());
    }

    @Test
    void activeTaskProceedsToDownloadBoundary() {
        when(asyncTaskClient.updateProgress(anyLong(), anyInt())).thenReturn(R.ok(true));
        when(fileClient.getPresignedUrl(anyString())).thenReturn(R.fail(500, "no file"));
        DeviceImportDTO dto = new DeviceImportDTO();
        dto.setFileKey("tenant/file.csv");
        dto.setFileFormat("CSV");

        service.executeImport(100L, dto, 1L, 2L);

        verify(fileClient).getPresignedUrl("tenant/file.csv");
        verify(asyncTaskClient).failTask(anyLong(), anyString());
    }
}
