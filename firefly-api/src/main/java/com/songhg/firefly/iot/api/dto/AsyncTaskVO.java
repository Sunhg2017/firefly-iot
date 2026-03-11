package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

/**
 * 异步任务视图对象（跨服务共享 VO，供 Feign 客户端使用）
 */
@Data
public class AsyncTaskVO implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long id;
    private String taskName;
    private String taskType;
    private String bizType;
    private String fileFormat;
    private String status;
    private Integer progress;
    private String extraData;
    private String resultUrl;
    private Long resultSize;
    private Integer totalRows;
    private String errorMessage;
    private Long createdBy;
    private LocalDateTime completedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
