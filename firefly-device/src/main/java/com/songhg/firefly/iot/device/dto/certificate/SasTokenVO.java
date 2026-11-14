package com.songhg.firefly.iot.device.dto.certificate;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.Instant;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Schema(description = "SAS 时效令牌")
public class SasTokenVO {

    @Schema(description = "令牌")
    private String token;

    @Schema(description = "过期时间")
    private Instant expiresAt;
}
