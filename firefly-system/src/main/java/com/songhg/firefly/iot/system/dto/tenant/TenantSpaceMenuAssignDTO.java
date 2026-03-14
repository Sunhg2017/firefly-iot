package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
@Schema(description = "租户空间菜单授权请求")
public class TenantSpaceMenuAssignDTO {

    @Schema(description = "已授权菜单键集合")
    @NotEmpty(message = "请至少选择一个租户空间菜单")
    private List<String> menuKeys;
}
