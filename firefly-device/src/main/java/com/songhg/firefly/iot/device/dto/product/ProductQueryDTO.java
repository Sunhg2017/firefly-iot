package com.songhg.firefly.iot.device.dto.product;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.ProductCategory;
import com.songhg.firefly.iot.common.enums.ProductStatus;
import com.songhg.firefly.iot.common.enums.ProtocolType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Product paginated query request.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "产品分页查询请求")
public class ProductQueryDTO extends PageQuery {

    /** Fuzzy search keyword (matches name) */
    @Schema(description = "关键词", example = "温度计")
    private String keyword;

    @Schema(description = "分类筛选")
    private ProductCategory category;

    @Schema(description = "协议筛选")
    private ProtocolType protocol;

    @Schema(description = "状态筛选")
    private ProductStatus status;

    @Schema(description = "项目编号筛选")
    private Long projectId;
}
