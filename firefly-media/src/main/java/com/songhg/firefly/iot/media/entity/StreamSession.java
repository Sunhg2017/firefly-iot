package com.songhg.firefly.iot.media.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.StreamStatus;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("stream_sessions")
public class StreamSession {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long deviceId;
    private String channelId;
    private String streamId;
    private StreamStatus status;
    private String flvUrl;
    private String hlsUrl;
    private String webrtcUrl;
    private LocalDateTime startedAt;
    private LocalDateTime stoppedAt;
    private LocalDateTime createdAt;
}
