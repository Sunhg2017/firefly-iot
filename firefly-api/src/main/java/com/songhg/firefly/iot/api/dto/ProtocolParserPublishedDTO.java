package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class ProtocolParserPublishedDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long definitionId;
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
    private String visualConfigJson;
    private String scriptLanguage;
    private String scriptContent;
    private String pluginId;
    private String pluginVersion;
    private Integer timeoutMs;
    private String errorPolicy;
    private String releaseMode;
    private String releaseConfigJson;
    private String status;
    private Integer versionNo;
}
