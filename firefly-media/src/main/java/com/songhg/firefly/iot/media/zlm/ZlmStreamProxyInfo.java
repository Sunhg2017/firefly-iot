package com.songhg.firefly.iot.media.zlm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ZlmStreamProxyInfo {

    private String key;
    private String url;
    private Integer status;
    private Long liveSecs;
    private Integer rePullCount;
    private SourceInfo src;

    public String resolveApp() {
        return src == null ? null : src.getApp();
    }

    public String resolveStream() {
        return src == null ? null : src.getStream();
    }

    @Data
    @JsonIgnoreProperties(ignoreUnknown = true)
    public static class SourceInfo {

        private String app;
        private String stream;
        private String vhost;
    }
}
