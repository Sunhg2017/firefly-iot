package com.songhg.firefly.iot.device.dto.ota;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.OtaTaskStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * OTA task paginated query request.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "升级任务分页查询")
public class OtaTaskQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "产品编号筛选")
    private Long productId;

    @Schema(description = "任务状态筛选")
    private OtaTaskStatus status;
}
