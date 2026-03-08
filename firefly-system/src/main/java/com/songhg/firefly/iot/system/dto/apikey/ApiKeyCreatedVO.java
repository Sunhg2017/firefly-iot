package com.songhg.firefly.iot.system.dto.apikey;

import com.songhg.firefly.iot.common.enums.ApiKeyStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * 创建 API Key 后返回的 VO，包含 secretKey（仅此一次返回）。
 */
@Data
@Schema(description = "接口密钥创建响应")
public class ApiKeyCreatedVO {

    @Schema(description = "接口密钥编号")
    private Long id;

    @Schema(description = "名称")
    private String name;

    @Schema(description = "访问密钥")
    private String accessKey;

    @Schema(description = "密钥")
    private String secretKey;

    @Schema(description = "权限范围")
    private List<String> scopes;

    @Schema(description = "每分钟限流")
    private Integer rateLimitPerMin;

    @Schema(description = "每日限流")
    private Integer rateLimitPerDay;

    @Schema(description = "状态")
    private ApiKeyStatus status;

    @Schema(description = "过期时间")
    private LocalDateTime expireAt;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;
}
