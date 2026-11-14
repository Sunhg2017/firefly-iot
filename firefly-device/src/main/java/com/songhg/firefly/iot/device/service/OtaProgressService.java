package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.enums.OtaDeviceStatus;
import com.songhg.firefly.iot.common.enums.OtaTaskStatus;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.device.entity.OtaTask;
import com.songhg.firefly.iot.device.entity.OtaTaskDevice;
import com.songhg.firefly.iot.device.mapper.OtaTaskDeviceMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * OTA 进度回执处理：把 {@code device.ota.progress} 转换成逐设备状态，并汇总任务计数。
 *
 * <p>进度消息可携带 {@code taskId}；缺失时按设备最近一条未终结任务反查，
 * 兼容设备侧只上报版本与进度的简单实现。</p>
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class OtaProgressService {

    private final OtaTaskMapper otaTaskMapper;
    private final OtaTaskDeviceMapper otaTaskDeviceMapper;

    @Transactional
    public void handleProgress(DeviceMessage message) {
        if (message == null || message.getDeviceId() == null) {
            return;
        }
        Map<String, Object> payload = message.getPayload();
        if (payload == null || payload.isEmpty()) {
            return;
        }

        Long taskId = toLong(payload.get("taskId"));
        OtaTaskDevice record = findProgressRecord(taskId, message.getDeviceId());
        if (record == null) {
            log.debug("No OTA task device record for progress: deviceId={}, taskId={}", message.getDeviceId(), taskId);
            return;
        }

        int progress = clampProgress(toInt(payload.get("progress")));
        String statusText = payload.get("status") == null
                ? ""
                : String.valueOf(payload.get("status")).toUpperCase(Locale.ROOT);
        OtaDeviceStatus status = resolveStatus(statusText, progress);
        String errorMessage = payload.get("errorMessage") == null ? null : String.valueOf(payload.get("errorMessage"));

        LocalDateTime now = LocalDateTime.now();
        record.setProgress(progress);
        record.setStatus(status);
        record.setErrorMessage(truncate(errorMessage));
        record.setUpdatedAt(now);
        if (record.getStartedAt() == null && status != OtaDeviceStatus.PENDING) {
            record.setStartedAt(now);
        }
        if (isTerminal(status) && record.getFinishedAt() == null) {
            record.setFinishedAt(now);
        }
        otaTaskDeviceMapper.updateById(record);

        recomputeTask(record.getTaskId());
        log.info("OTA progress updated: taskId={}, deviceId={}, status={}, progress={}",
                record.getTaskId(), message.getDeviceId(), status, progress);
    }

    private OtaTaskDevice findProgressRecord(Long taskId, Long deviceId) {
        if (taskId != null) {
            return otaTaskDeviceMapper.selectOne(new LambdaQueryWrapper<OtaTaskDevice>()
                    .eq(OtaTaskDevice::getTaskId, taskId)
                    .eq(OtaTaskDevice::getDeviceId, deviceId)
                    .orderByDesc(OtaTaskDevice::getId)
                    .last("LIMIT 1"));
        }
        List<OtaTaskDevice> candidates = otaTaskDeviceMapper.selectList(new LambdaQueryWrapper<OtaTaskDevice>()
                .eq(OtaTaskDevice::getDeviceId, deviceId)
                .in(OtaTaskDevice::getStatus, OtaDeviceStatus.PENDING, OtaDeviceStatus.DOWNLOADING, OtaDeviceStatus.UPGRADING)
                .orderByDesc(OtaTaskDevice::getId));
        return candidates.isEmpty() ? null : candidates.get(0);
    }

    /**
     * 汇总任务计数：全部设备进入终态后任务才结束；有失败且无成功标记为 FAILED。
     */
    private void recomputeTask(Long taskId) {
        List<OtaTaskDevice> records = otaTaskDeviceMapper.selectList(new LambdaQueryWrapper<OtaTaskDevice>()
                .eq(OtaTaskDevice::getTaskId, taskId));
        if (records.isEmpty()) {
            return;
        }
        long success = records.stream().filter(item -> item.getStatus() == OtaDeviceStatus.SUCCESS).count();
        long failure = records.stream().filter(item -> item.getStatus() == OtaDeviceStatus.FAILURE).count();
        long cancelled = records.stream().filter(item -> item.getStatus() == OtaDeviceStatus.CANCELLED).count();

        OtaTask task = otaTaskMapper.selectById(taskId);
        if (task == null) {
            return;
        }
        task.setTotalCount(records.size());
        task.setSuccessCount((int) success);
        task.setFailureCount((int) failure);
        if (success + failure + cancelled == records.size() && task.getStatus() != OtaTaskStatus.CANCELLED) {
            task.setStatus(success == 0 && failure > 0 ? OtaTaskStatus.FAILED : OtaTaskStatus.COMPLETED);
            task.setFinishedAt(LocalDateTime.now());
        }
        otaTaskMapper.updateById(task);
    }

    private OtaDeviceStatus resolveStatus(String statusText, int progress) {
        if (statusText.contains("FAIL") || statusText.contains("ERROR")) {
            return OtaDeviceStatus.FAILURE;
        }
        if (statusText.contains("SUCCESS") || statusText.contains("DONE") || statusText.contains("COMPLETE")) {
            return OtaDeviceStatus.SUCCESS;
        }
        if (statusText.contains("UPGRAD") || statusText.contains("INSTALL")) {
            return OtaDeviceStatus.UPGRADING;
        }
        if (statusText.contains("DOWNLOAD")) {
            return OtaDeviceStatus.DOWNLOADING;
        }
        if (progress >= 100) {
            return OtaDeviceStatus.SUCCESS;
        }
        if (progress > 0) {
            return OtaDeviceStatus.UPGRADING;
        }
        return OtaDeviceStatus.DOWNLOADING;
    }

    private boolean isTerminal(OtaDeviceStatus status) {
        return status == OtaDeviceStatus.SUCCESS
                || status == OtaDeviceStatus.FAILURE
                || status == OtaDeviceStatus.CANCELLED;
    }

    private int clampProgress(Integer progress) {
        if (progress == null) {
            return 0;
        }
        return Math.max(0, Math.min(100, progress));
    }

    private Integer toInt(Object value) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        if (value == null) {
            return null;
        }
        try {
            return Integer.parseInt(String.valueOf(value).trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Long toLong(Object value) {
        if (value instanceof Number number) {
            return number.longValue();
        }
        if (value == null || !StringUtils.hasText(String.valueOf(value))) {
            return null;
        }
        try {
            return Long.parseLong(String.valueOf(value).trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private String truncate(String message) {
        if (message == null) {
            return null;
        }
        return message.length() > 500 ? message.substring(0, 500) : message;
    }
}
