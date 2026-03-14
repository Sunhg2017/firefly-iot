package com.songhg.firefly.iot.system.dto.tenant;

import com.songhg.firefly.iot.system.dto.workspace.WorkspaceMenuNodeVO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "租户空间授权详情")
public class TenantSpaceMenuAuthorizationVO {

    @Schema(description = "租户空间菜单树")
    private List<WorkspaceMenuNodeVO> menuTree;

    @Schema(description = "已授权菜单键")
    private List<String> selectedMenuKeys;
}
