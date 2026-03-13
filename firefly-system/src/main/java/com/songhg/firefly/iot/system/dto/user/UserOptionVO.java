package com.songhg.firefly.iot.system.dto.user;

import com.songhg.firefly.iot.common.enums.UserStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Lightweight user option for selectors.
 */
@Data
@Schema(description = "Selectable user option")
public class UserOptionVO {

    @Schema(description = "Username", example = "zhangsan")
    private String username;

    @Schema(description = "Real name", example = "张三")
    private String realName;

    @Schema(description = "Phone", example = "13800138000")
    private String phone;

    @Schema(description = "Email", example = "zhangsan@example.com")
    private String email;

    @Schema(description = "User status")
    private UserStatus status;
}
