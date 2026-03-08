package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "协议解析定义更新请求")
public class ProtocolParserUpdateDTO {

    @Size(max = 16)
    @Schema(description = "作用域类型", example = "PRODUCT")
    private String scopeType;

    @Schema(description = "作用域编号")
    private Long scopeId;

    @Size(max = 32)
    @Schema(description = "协议", example = "CUSTOM")
    private String protocol;

    @Size(max = 32)
    @Schema(description = "传输层", example = "TCP")
    private String transport;

    @Size(max = 16)
    @Schema(description = "方向", example = "UPLINK")
    private String direction;

    @Size(max = 16)
    @Schema(description = "解析模式", example = "SCRIPT")
    private String parserMode;

    @Size(max = 16)
    @Schema(description = "拆包模式", example = "NONE")
    private String frameMode;

    @Schema(description = "匹配规则 JSON")
    private String matchRuleJson;

    @Schema(description = "拆包配置 JSON")
    private String frameConfigJson;

    @Schema(description = "解析配置 JSON")
    private String parserConfigJson;

    @Size(max = 16)
    @Schema(description = "脚本语言", example = "JS")
    private String scriptLanguage;

    @Schema(description = "脚本内容")
    private String scriptContent;

    @Size(max = 128)
    @Schema(description = "插件编号")
    private String pluginId;

    @Size(max = 64)
    @Schema(description = "插件版本")
    private String pluginVersion;

    @Schema(description = "执行超时毫秒", example = "50")
    private Integer timeoutMs;

    @Size(max = 16)
    @Schema(description = "错误策略", example = "ERROR")
    private String errorPolicy;
}
