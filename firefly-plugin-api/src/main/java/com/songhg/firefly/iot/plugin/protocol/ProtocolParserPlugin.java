package com.songhg.firefly.iot.plugin.protocol;

public interface ProtocolParserPlugin {

    String pluginId();

    String version();

    default String displayName() {
        return pluginId();
    }

    default String description() {
        return "";
    }

    default boolean supportsParse() {
        return true;
    }

    default boolean supportsEncode() {
        return false;
    }

    default ProtocolPluginParseResult parse(ProtocolPluginParseContext context) {
        throw new UnsupportedOperationException("Parse is not supported by plugin " + pluginId());
    }

    default ProtocolPluginEncodeResult encode(ProtocolPluginEncodeContext context) {
        throw new UnsupportedOperationException("Encode is not supported by plugin " + pluginId());
    }
}
