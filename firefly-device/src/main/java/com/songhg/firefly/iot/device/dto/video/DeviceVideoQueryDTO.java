package com.songhg.firefly.iot.device.dto.video;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.StreamMode;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "视频设备分页查询")
public class DeviceVideoQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "视频接入方式")
    private StreamMode streamMode;

    @Schema(description = "设备状态")
    private VideoDeviceStatus status;
}
