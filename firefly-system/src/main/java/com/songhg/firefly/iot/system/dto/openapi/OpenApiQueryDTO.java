package com.songhg.firefly.iot.system.dto.openapi;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "OpenAPI page query")
public class OpenApiQueryDTO extends PageQuery {

    @Schema(description = "Search keyword")
    private String keyword;

    @Schema(description = "Service code filter")
    private String serviceCode;

    @Schema(description = "Enabled filter")
    private Boolean enabled;
}
