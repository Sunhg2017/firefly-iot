package com.songhg.firefly.iot.system.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Refresh token request.
 */
@Data
@Schema(description = "Refresh token request")
public class RefreshTokenRequest {

    @Schema(description = "Refresh token")
    @NotBlank(message = "refreshToken不能为空")
    private String refreshToken;
}
