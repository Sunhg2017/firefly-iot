package com.songhg.firefly.iot.device.dto.geo;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Geo-fence paginated query request.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "围栏分页查询")
public class GeoFenceQueryDTO extends PageQuery {

    @Schema(description = "关键词")
    private String keyword;

    @Schema(description = "围栏类型筛选")
    private String fenceType;

    @Schema(description = "启用状态筛选")
    private Boolean enabled;
}
