package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "Protocol parser create request")
public class ProtocolParserCreateDTO {

    @Schema(description = "Product id, required when scopeType=PRODUCT")
    private Long productId;

    @Size(max = 16)
    @Schema(description = "Scope type", example = "PRODUCT")
    private String scopeType;

    @Schema(description = "Scope id, default is productId or tenantId")
    private Long scopeId;

    @NotBlank(message = "protocol must not be blank")
    @Size(max = 32)
    @Schema(description = "Protocol", example = "CUSTOM")
    private String protocol;

    @NotBlank(message = "transport must not be blank")
    @Size(max = 32)
    @Schema(description = "Transport", example = "TCP")
    private String transport;

    @Size(max = 16)
    @Schema(description = "Direction", example = "UPLINK")
    private String direction;

    @Size(max = 16)
    @Schema(description = "Parser mode", example = "SCRIPT")
    private String parserMode;

    @Size(max = 16)
    @Schema(description = "Frame mode", example = "NONE")
    private String frameMode;

    @Schema(description = "Match rule JSON")
    private String matchRuleJson;

    @Schema(description = "Frame config JSON")
    private String frameConfigJson;

    @Schema(description = "Parser config JSON")
    private String parserConfigJson;

    @Schema(description = "Visual flow config JSON")
    private String visualConfigJson;

    @Size(max = 16)
    @Schema(description = "Script language", example = "JS")
    private String scriptLanguage;

    @Schema(description = "Script content")
    private String scriptContent;

    @Size(max = 128)
    @Schema(description = "Plugin id")
    private String pluginId;

    @Size(max = 64)
    @Schema(description = "Plugin version")
    private String pluginVersion;

    @Schema(description = "Timeout in milliseconds", example = "50")
    private Integer timeoutMs;

    @Size(max = 16)
    @Schema(description = "Error policy", example = "ERROR")
    private String errorPolicy;

    @Size(max = 16)
    @Schema(description = "Release mode", example = "ALL")
    private String releaseMode;

    @Schema(description = "Release config JSON")
    private String releaseConfigJson;
}
