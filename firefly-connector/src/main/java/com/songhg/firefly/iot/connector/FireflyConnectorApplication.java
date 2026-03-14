package com.songhg.firefly.iot.connector;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(
        scanBasePackages = {
                "com.songhg.firefly.iot.connector",
                "com.songhg.firefly.iot.common"
        },
        exclude = DataSourceAutoConfiguration.class
)
@EnableFeignClients(basePackages = "com.songhg.firefly.iot.api.client")
@EnableScheduling
public class FireflyConnectorApplication {

    public static void main(String[] args) {
        SpringApplication.run(FireflyConnectorApplication.class, args);
    }
}
