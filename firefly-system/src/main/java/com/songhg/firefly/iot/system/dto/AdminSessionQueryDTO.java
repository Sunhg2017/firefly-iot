package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.Platform;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "管理员会话分页查询请求")
public class AdminSessionQueryDTO extends PageQuery {

    @Schema(description = "关键字，按管理员账号、姓名、租户名称或登录 IP 模糊匹配")
    private String keyword;

    @Schema(description = "平台筛选")
    private Platform platform;

    @Schema(description = "管理员身份筛选（SYSTEM_OPS/TENANT_SUPER_ADMIN）")
    private String adminType;
}
