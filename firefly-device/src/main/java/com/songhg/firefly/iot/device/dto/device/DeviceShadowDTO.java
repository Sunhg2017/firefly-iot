package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.Map;

/**
 * Device shadow (digital twin) state.
 */
@Data
@Schema(description = "设备影子状态")
public class DeviceShadowDTO {

    @Schema(description = "设备编号")
    private Long deviceId;

    /** Desired state set by the cloud/application */
    @Schema(description = "期望状态")
    private Map<String, Object> desired;

    /** Reported state from the physical device */
    @Schema(description = "上报状态")
    private Map<String, Object> reported;

    /** Shadow metadata (timestamps per key) */
    @Schema(description = "影子元数据")
    private Map<String, Object> metadata;

    /** Optimistic lock version */
    @Schema(description = "影子版本", example = "5")
    private Long version;

    /** Last update timestamp (ISO 8601) */
    @Schema(description = "最后更新时间")
    private String updatedAt;
}
