package com.songhg.firefly.iot.media.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;

import java.util.Locale;

@Data
@Component
@ConfigurationProperties(prefix = "zlmediakit")
public class ZlmProperties {

    private String host = "localhost";
    private int port = 8080;
    private String secret = "";
    private int sslPort = 8443;
    private int rtpPort = 10000;
    private String hookUrl = "";
    private String publicHost = "";
    private Integer publicPort;
    private Integer publicSslPort;
    private String publicScheme = "http";

    public String getApiUrl() {
        return "http://" + host + ":" + port;
    }

    public String getPlayBaseUrl() {
        String scheme = normalizeScheme();
        String hostForPlayback = StringUtils.hasText(publicHost) ? publicHost : host;
        int portForPlayback = resolvePlaybackPort(scheme);
        return scheme + "://" + hostForPlayback + ":" + portForPlayback;
    }

    private String normalizeScheme() {
        if (!StringUtils.hasText(publicScheme)) {
            return "http";
        }
        String normalized = publicScheme.trim().toLowerCase(Locale.ROOT);
        return "https".equals(normalized) ? "https" : "http";
    }

    private int resolvePlaybackPort(String scheme) {
        if ("https".equals(scheme)) {
            return publicSslPort != null ? publicSslPort : sslPort;
        }
        return publicPort != null ? publicPort : port;
    }
}
