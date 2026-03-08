package com.songhg.firefly.iot.support.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("async_tasks")
public class AsyncTask extends TenantEntity {

    private String taskName;
    private String taskType;
    private String bizType;
    private String fileFormat;
    private String status;
    private Integer progress;
    private String queryParams;
    private String resultUrl;
    private Long resultSize;
    private Integer totalRows;
    private String errorMessage;
    private Long createdBy;
    private LocalDateTime completedAt;
}
