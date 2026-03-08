package com.songhg.firefly.iot.device.dto.ota;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.FirmwareStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * OTA firmware paginated query request.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "固件分页查询")
public class FirmwareQueryDTO extends PageQuery {

    @Schema(description = "产品编号筛选")
    private Long productId;

    @Schema(description = "固件状态筛选")
    private FirmwareStatus status;

    @Schema(description = "关键词")
    private String keyword;
}
