package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.enums.OauthProvider;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * OAuth binding view object.
 */
@Data
@Schema(description = "OAuth binding view object")
public class OauthBindingVO {

    @Schema(description = "Binding ID")
    private Long id;

    @Schema(description = "OAuth provider")
    private OauthProvider provider;

    @Schema(description = "OAuth nickname")
    private String nickname;

    @Schema(description = "Avatar URL")
    private String avatarUrl;

    @Schema(description = "Binding time")
    private LocalDateTime createdAt;
}
