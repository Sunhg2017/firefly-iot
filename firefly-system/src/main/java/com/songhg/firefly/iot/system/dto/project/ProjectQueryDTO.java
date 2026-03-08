package com.songhg.firefly.iot.system.dto.project;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.ProjectStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * Project paginated query.
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "Project paginated query")
public class ProjectQueryDTO extends PageQuery {

    @Schema(description = "Search keyword")
    private String keyword;

    @Schema(description = "Status filter")
    private ProjectStatus status;
}
