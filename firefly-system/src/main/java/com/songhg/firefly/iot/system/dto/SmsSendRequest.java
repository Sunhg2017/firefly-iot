package com.songhg.firefly.iot.system.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * SMS send request.
 */
@Data
@Schema(description = "SMS send request")
public class SmsSendRequest {

    @Schema(description = "Phone number")
    @NotBlank(message = "手机号不能为空")
    private String phone;

    @Schema(description = "Purpose (e.g. LOGIN, REGISTER)", example = "LOGIN")
    private String purpose;
}
