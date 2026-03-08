package com.songhg.firefly.iot.connector.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "firefly.snmp")
public class SnmpProperties {

    private boolean enabled = true;

    private Trap trap = new Trap();

    private Collector collector = new Collector();

    private int retries = 2;

    private long timeoutMs = 3000;

    @Data
    public static class Trap {
        private boolean enabled = true;
        private String listenAddress = "0.0.0.0";
        private int port = 162;
    }

    @Data
    public static class Collector {
        private boolean enabled = true;
        private int poolSize = 5;
        private long defaultIntervalMs = 60000;
    }
}
