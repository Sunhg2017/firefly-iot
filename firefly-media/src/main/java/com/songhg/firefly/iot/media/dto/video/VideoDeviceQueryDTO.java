package com.songhg.firefly.iot.media.dto.video;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Video device paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "视频设备分页查询")
public class VideoDeviceQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "流模式筛选")
    private StreamMode streamMode;

    @Schema(description = "状态筛选")
    private VideoDeviceStatus status;
}
