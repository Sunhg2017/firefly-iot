package com.songhg.firefly.iot.media.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.media.dto.video.VideoRecordingVO;
import com.songhg.firefly.iot.media.entity.VideoRecording;
import com.songhg.firefly.iot.media.mapper.VideoRecordingMapper;
import com.songhg.firefly.iot.media.zlm.ZlmApiClient;
import com.songhg.firefly.iot.media.zlm.ZlmMp4RecordDownload;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 录像检索、历史回放与录像下载服务。
 * <p>
 * 录像元数据由 {@code on_record_mp4} webhook 写入 {@code video_recordings}，
 * 录像文件本体仍存于 ZLM 磁盘，回放/下载时经 {@link ZlmApiClient#openMp4RecordFile} 流式代理，
 * 不把 ZLM 的 secret 暴露给前端。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class RecordingService {

    private final VideoRecordingMapper videoRecordingMapper;
    private final ZlmApiClient zlmApiClient;

    public List<VideoRecordingVO> listRecordings(Long deviceId) {
        Long tenantId = requireTenantId();
        LambdaQueryWrapper<VideoRecording> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VideoRecording::getTenantId, tenantId)
                .eq(VideoRecording::getDeviceId, deviceId)
                .orderByDesc(VideoRecording::getStartTime);
        return videoRecordingMapper.selectList(wrapper).stream()
                .map(this::toVO)
                .toList();
    }

    /**
     * 定位并授权录像文件，返回可流式消费的 ZLM 下载句柄。
     *
     * @param deviceId        平台设备资产编号
     * @param fileName        录像文件名（业务唯一键之一）
     * @param startTimeMillis 录像开始时间（epoch 毫秒，与 fileName 组合定位，避免同名文件歧义）
     */
    public ZlmMp4RecordDownload openRecordingStream(Long deviceId, String fileName, long startTimeMillis) {
        VideoRecording recording = resolveRecording(deviceId, fileName, startTimeMillis);
        return zlmApiClient.openMp4RecordFile(recording.getApp(), recording.getStream(), recording.getFilePath());
    }

    /**
     * 供回放/下载接口复用：按「租户 + 设备 + 文件名 + 开始时间」定位录像，天然完成租户与设备越权校验。
     */
    public VideoRecording resolveRecording(Long deviceId, String fileName, long startTimeMillis) {
        Long tenantId = requireTenantId();
        LambdaQueryWrapper<VideoRecording> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(VideoRecording::getTenantId, tenantId)
                .eq(VideoRecording::getDeviceId, deviceId)
                .eq(VideoRecording::getFileName, fileName)
                .eq(VideoRecording::getStartTime, startTimeMillis)
                .orderByDesc(VideoRecording::getCreatedAt)
                .last("LIMIT 1");
        VideoRecording recording = videoRecordingMapper.selectOne(wrapper);
        if (recording == null) {
            throw new BizException(ResultCode.NOT_FOUND, "未找到对应的录像文件");
        }
        return recording;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED, "缺少租户上下文");
        }
        return tenantId;
    }

    private VideoRecordingVO toVO(VideoRecording recording) {
        VideoRecordingVO vo = new VideoRecordingVO();
        vo.setFileName(recording.getFileName());
        vo.setFileSize(recording.getFileSize());
        vo.setStartTime(recording.getStartTime());
        vo.setDurationSeconds(recording.getDurationSeconds());
        vo.setChannelId(recording.getChannelId());
        return vo;
    }
}
