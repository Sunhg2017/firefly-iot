package com.songhg.firefly.iot.data.service;

import com.songhg.firefly.iot.api.client.AsyncTaskClient;
import com.songhg.firefly.iot.api.dto.AsyncTaskCreateDTO;
import com.songhg.firefly.iot.api.dto.AsyncTaskVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.data.dto.analysis.DataExportDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

/**
 * 数据分析自定义导出任务注册服务。
 */
@Service
@RequiredArgsConstructor
public class DataExportTaskService {

    private final AsyncTaskClient asyncTaskClient;
    private final DataExportTaskExecutor dataExportTaskExecutor;

    public Long registerExportTask(DataExportDTO dto) {
        AsyncTaskCreateDTO createDTO = new AsyncTaskCreateDTO();
        createDTO.setTaskName("设备数据自定义导出");
        createDTO.setTaskType("EXPORT");
        createDTO.setBizType("DATA_ANALYSIS_EXPORT");
        createDTO.setFileFormat("CSV");

        R<AsyncTaskVO> taskResult = asyncTaskClient.createTask(createDTO);
        if (taskResult == null || taskResult.getData() == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "创建导出任务失败");
        }

        Long taskId = taskResult.getData().getId();
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        dataExportTaskExecutor.executeExportAsync(taskId, dto, tenantId, userId);
        return taskId;
    }
}
