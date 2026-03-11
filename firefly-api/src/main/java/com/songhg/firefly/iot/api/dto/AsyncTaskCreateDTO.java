package com.songhg.firefly.iot.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serializable;

/**
 * 异步任务创建请求（跨服务共享 DTO，供 Feign 客户端使用）
 */
@Data
public class AsyncTaskCreateDTO implements Serializable {

    private static final long serialVersionUID = 1L;

    /** 任务名称 */
    @NotBlank(message = "任务名称不能为空")
    @Size(max = 200)
    private String taskName;

    /** 任务类型: EXPORT / IMPORT / SYNC / BATCH / OTHER */
    @NotBlank(message = "任务类型不能为空")
    private String taskType;

    /** 业务类型: DEVICE_IMPORT / THING_MODEL_IMPORT / ... */
    private String bizType;

    /** 文件格式: CSV / EXCEL / JSON */
    private String fileFormat;

    /** 附加业务数据（JSON 字符串），例如 fileKey、productId 等 */
    private String extraData;
}
