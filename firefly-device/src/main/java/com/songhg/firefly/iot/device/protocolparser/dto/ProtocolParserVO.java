package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "协议解析定义视图")
public class ProtocolParserVO {

    private Long id;
    private Long tenantId;
    private Long productId;
    private String scopeType;
    private Long scopeId;
    private String protocol;
    private String transport;
    private String direction;
    private String parserMode;
    private String frameMode;
    private String matchRuleJson;
    private String frameConfigJson;
    private String parserConfigJson;
    private String scriptLanguage;
    private String scriptContent;
    private String pluginId;
    private String pluginVersion;
    private Integer timeoutMs;
    private String errorPolicy;
    private String status;
    private Integer currentVersion;
    private Integer publishedVersion;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
