package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class ProtocolParserPluginDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String pluginId;
    private String version;
    private String displayName;
    private String description;
    private boolean supportsParse;
    private boolean supportsEncode;
    private String sourceType;
    private String sourceLocation;
    private String loadedAt;
}
