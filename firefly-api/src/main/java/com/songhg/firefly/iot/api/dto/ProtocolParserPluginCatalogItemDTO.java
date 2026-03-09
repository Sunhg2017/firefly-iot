package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

@Data
public class ProtocolParserPluginCatalogItemDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private String pluginId;
    private String latestVersion;
    private String displayName;
    private String description;
    private String vendor;
    private boolean installed;
    private String installedVersion;
    private String installHint;
}
