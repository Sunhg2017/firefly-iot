package com.songhg.firefly.iot.system.dto.apikey;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * API key paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "API key paginated query")
public class ApiKeyQueryDTO extends PageQuery {

    @Schema(description = "Search keyword (name)")
    private String keyword;

    @Schema(description = "Status filter")
    private ApiKeyStatus status;
}
