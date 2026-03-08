package com.songhg.firefly.iot.system.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * Push token update request.
 */
@Data
@Schema(description = "Push token update request")
public class PushTokenUpdateDTO {

    @Schema(description = "Push notification token")
    @NotBlank(message = "推送Token不能为空")
    private String pushToken;

    @Schema(description = "Push channel (FCM / APNs / JPush)", example = "FCM")
    private String pushChannel;
}
