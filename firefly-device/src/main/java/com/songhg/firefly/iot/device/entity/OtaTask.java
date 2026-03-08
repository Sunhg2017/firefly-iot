package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.OtaTaskStatus;
import com.songhg.firefly.iot.common.enums.OtaTaskType;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("ota_tasks")
public class OtaTask {

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long tenantId;
    private Long productId;
    private Long firmwareId;
    private String name;
    private String description;
    private OtaTaskType taskType;
    private String srcVersion;
    private String destVersion;
    private OtaTaskStatus status;
    private Integer totalCount;
    private Integer successCount;
    private Integer failureCount;
    private Integer grayRatio;
    private Long createdBy;
    private LocalDateTime startedAt;
    private LocalDateTime finishedAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
