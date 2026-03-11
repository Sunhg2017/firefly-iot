package com.songhg.firefly.iot.support.entity;

import com.baomidou.mybatisplus.annotation.TableField;
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

    /**
     * 附加业务数据（JSON 字符串），取代原 queryParams。
     * 数据库列名 extra_data，兼容旧列名 query_params（通过迁移脚本重命名）。
     */
    @TableField("extra_data")
    private String extraData;

    private String resultUrl;
    private Long resultSize;
    private Integer totalRows;
    private String errorMessage;
    private Long createdBy;
    private LocalDateTime completedAt;
}
