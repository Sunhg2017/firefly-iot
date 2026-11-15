package com.songhg.firefly.iot.media.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 视频录像元数据（由 ZLMediaKit on_record_mp4 webhook 写入）。
 */
@Data
@TableName("video_recordings")
public class VideoRecording {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long deviceId;
    private String channelId;
    private String app;
    private String stream;
    private String fileName;
    private String filePath;
    private Long fileSize;
    /** 录像开始时间（epoch 毫秒），避免 TIMESTAMPTZ 与 LocalDateTime 往返的时区歧义。 */
    private Long startTime;
    private Double durationSeconds;
    private LocalDateTime createdAt;
}
