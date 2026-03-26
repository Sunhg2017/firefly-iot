package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 视频通道基础信息（跨服务传输用）。
 */
@Data
public class InternalVideoChannelVO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long id;
    private Long deviceId;
    private String channelId;
    private String name;
    private String manufacturer;
    private String model;
    private String status;
    private Integer ptzType;
    private Integer subCount;
    private Double longitude;
    private Double latitude;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
