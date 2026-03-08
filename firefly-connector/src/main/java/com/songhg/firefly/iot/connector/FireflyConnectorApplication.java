package com.songhg.firefly.iot.connector;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.cloud.openfeign.EnableFeignClients;

@SpringBootApplication(
        scanBasePackages = {
                "com.songhg.firefly.iot.connector",
                "com.songhg.firefly.iot.common"
        },
        exclude = DataSourceAutoConfiguration.class
)
@EnableFeignClients(basePackages = "com.songhg.firefly.iot.api.client")
public class FireflyConnectorApplication {

    public static void main(String[] args) {
        SpringApplication.run(FireflyConnectorApplication.class, args);
    }
}
