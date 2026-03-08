package com.songhg.firefly.iot.media.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "gb28181.sip")
public class SipProperties {

    private String ip = "0.0.0.0";
    private int port = 5060;
    private String domain = "3402000000";
    private String id = "34020000002000000001";
    private String password = "";
    private String transport = "UDP";
    private int expires = 3600;
}
