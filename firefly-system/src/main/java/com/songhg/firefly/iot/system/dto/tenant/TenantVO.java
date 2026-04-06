package com.songhg.firefly.iot.system.dto.tenant;

import com.songhg.firefly.iot.common.enums.IsolationLevel;
import com.songhg.firefly.iot.common.enums.TenantStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Tenant view object.
 */
@Data
@Schema(description = "租户视图对象")
public class TenantVO {

    @Schema(description = "租户编号")
    private Long id;

    @Schema(description = "租户代码")
    private String code;

    @Schema(description = "租户名称")
    private String name;

    @Schema(description = "显示名称")
    private String displayName;

    @Schema(description = "描述")
    private String description;

    @Schema(description = "图标地址")
    private String logoUrl;

    @Schema(description = "联系人姓名")
    private String contactName;

    @Schema(description = "联系电话")
    private String contactPhone;

    @Schema(description = "联系邮箱")
    private String contactEmail;

    @Schema(description = "状态")
    private TenantStatus status;

    @Schema(description = "数据隔离级别")
    private IsolationLevel isolationLevel;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
