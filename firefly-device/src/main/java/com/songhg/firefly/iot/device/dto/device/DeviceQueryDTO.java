package com.songhg.firefly.iot.device.dto.device;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Device paginated query request.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "设备分页查询请求")
public class DeviceQueryDTO extends PageQuery {

    /** Fuzzy search keyword (matches deviceName / nickname) */
    @Schema(description = "关键词", example = "sensor")
    private String keyword;

    /** Filter by product */
    @Schema(description = "产品编号筛选")
    private Long productId;

    /** Filter by device group */
    @Schema(description = "设备分组编号筛选")
    private Long groupId;

    /** Filter by project */
    @Schema(description = "项目编号筛选")
    private Long projectId;

    /** Filter by device status (ENABLED / DISABLED) */
    @Schema(description = "设备状态筛选")
    private DeviceStatus status;

    /** Filter by online status (ONLINE / OFFLINE) */
    @Schema(description = "在线状态筛选")
    private OnlineStatus onlineStatus;

    @Schema(description = "是否排除视频设备")
    private Boolean excludeVideo;
}
