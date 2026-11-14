package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.api.client.AsyncTaskClient;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.AsyncTaskCreateDTO;
import com.songhg.firefly.iot.api.dto.AsyncTaskVO;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AsyncContextHelper;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.device.DeviceCredentialVO;
import com.songhg.firefly.iot.device.dto.device.DeviceTripleExportDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Map;

/**
 * 设备三元组异步导出：注册任务后由独立线程生成 CSV 并上传 MinIO，
 * 浏览器不再同步拉取密钥列表或自行拼装 CSV。
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DeviceTripleExportTask {

    private static final int MAX_ERROR_MESSAGE_LENGTH = 500;

    private final DeviceService deviceService;
    private final AsyncTaskClient asyncTaskClient;
    private final FileClient fileClient;
    private final ImportTaskDispatcher importTaskDispatcher;

    public Long register(DeviceTripleExportDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        AsyncTaskCreateDTO createDTO = new AsyncTaskCreateDTO();
        createDTO.setTaskName("设备三元组导出");
        createDTO.setTaskType("EXPORT");
        createDTO.setBizType("DEVICE_TRIPLE_EXPORT");
        createDTO.setFileFormat("CSV");
        R<AsyncTaskVO> taskResult = asyncTaskClient.createTask(createDTO);
        if (taskResult == null || taskResult.getData() == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "创建导出任务失败");
        }

        Long taskId = taskResult.getData().getId();
        importTaskDispatcher.dispatch(() -> execute(taskId, dto, tenantId, userId));
        log.info("设备三元组导出任务已注册: taskId={}", taskId);
        return taskId;
    }

    private void execute(Long taskId, DeviceTripleExportDTO dto, Long tenantId, Long userId) {
        try {
            AsyncContextHelper.setContext(tenantId, userId);
            asyncTaskClient.updateProgress(taskId, 10);

            // 通过代理调用带 @DataScope 的导出方法，保证异步线程仍按用户数据范围过滤。
            List<DeviceCredentialVO> devices = deviceService.exportDeviceTriples(dto);
            asyncTaskClient.updateProgress(taskId, 60);

            byte[] csv = buildCsv(devices);
            String objectName = "exports/device-triples-" + taskId + "-" + System.currentTimeMillis() + ".csv";
            R<Map<String, String>> uploadResult = fileClient.uploadBytes(objectName, "text/csv", csv);
            if (uploadResult == null || uploadResult.getData() == null) {
                throw new BizException(ResultCode.INTERNAL_ERROR, "上传导出文件失败");
            }

            asyncTaskClient.completeTask(taskId, true, objectName, (long) csv.length, devices.size(), null);
            log.info("设备三元组导出完成: taskId={}, rows={}", taskId, devices.size());
        } catch (Exception ex) {
            log.error("设备三元组导出失败: taskId={}, error={}", taskId, ex.getMessage(), ex);
            asyncTaskClient.failTask(taskId, truncate("导出失败: " + ex.getMessage()));
        } finally {
            AsyncContextHelper.clearContext();
        }
    }

    /**
     * 导出内容使用产品 Key、设备名称等业务唯一标识，不暴露数据库主键。
     */
    private byte[] buildCsv(List<DeviceCredentialVO> devices) {
        StringBuilder builder = new StringBuilder();
        builder.append('\ufeff');
        builder.append("productKey,deviceName,nickname,deviceSecret").append('\n');
        for (DeviceCredentialVO device : devices) {
            builder.append(csvCell(device.getProductKey())).append(',')
                    .append(csvCell(device.getDeviceName())).append(',')
                    .append(csvCell(device.getNickname())).append(',')
                    .append(csvCell(device.getDeviceSecret())).append('\n');
        }
        return builder.toString().getBytes(StandardCharsets.UTF_8);
    }

    private String csvCell(String value) {
        if (value == null) {
            return "";
        }
        if (value.contains(",") || value.contains("\"") || value.contains("\n")) {
            return "\"" + value.replace("\"", "\"\"") + "\"";
        }
        return value;
    }

    private String truncate(String message) {
        if (message == null) {
            return null;
        }
        return message.length() > MAX_ERROR_MESSAGE_LENGTH
                ? message.substring(0, MAX_ERROR_MESSAGE_LENGTH)
                : message;
    }
}
