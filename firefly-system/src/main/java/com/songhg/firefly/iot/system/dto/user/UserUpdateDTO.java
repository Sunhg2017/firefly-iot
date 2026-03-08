package com.songhg.firefly.iot.system.dto.user;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * User update request.
 */
@Data
@Schema(description = "User update request")
public class UserUpdateDTO {

    @Schema(description = "Phone number")
    private String phone;

    @Schema(description = "Email")
    private String email;

    @Schema(description = "Real name")
    private String realName;

    @Schema(description = "Avatar URL")
    private String avatarUrl;
}
