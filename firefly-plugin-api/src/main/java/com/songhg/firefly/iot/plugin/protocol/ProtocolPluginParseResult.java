package com.songhg.firefly.iot.plugin.protocol;

import lombok.Data;

import java.util.List;

@Data
public class ProtocolPluginParseResult {

    private boolean drop;
    private boolean needMoreData;
    private ProtocolPluginDeviceIdentity identity;
    private List<ProtocolPluginMessage> messages;
}
