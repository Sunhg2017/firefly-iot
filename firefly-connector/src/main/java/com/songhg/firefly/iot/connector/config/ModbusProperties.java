package com.songhg.firefly.iot.connector.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "firefly.modbus")
public class ModbusProperties {

    private boolean enabled = true;

    private Collector collector = new Collector();

    @Data
    public static class Collector {
        private boolean enabled = true;
        private int poolSize = 5;
        private long defaultIntervalMs = 60000;
    }
}
