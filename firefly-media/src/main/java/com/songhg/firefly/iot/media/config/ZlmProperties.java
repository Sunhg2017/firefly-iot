package com.songhg.firefly.iot.media.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

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

    public String getApiUrl() {
        return "http://" + host + ":" + port;
    }
}
