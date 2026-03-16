package com.songhg.firefly.iot.connector;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.jdbc.DataSourceAutoConfiguration;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.context.annotation.FilterType;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication(exclude = DataSourceAutoConfiguration.class)
@ComponentScan(
        basePackages = {
                "com.songhg.firefly.iot.connector",
                "com.songhg.firefly.iot.common"
        },
        excludeFilters = @ComponentScan.Filter(
                type = FilterType.REGEX,
                pattern = "com\\.songhg\\.firefly\\.iot\\.common\\.mybatis\\.scope\\..*"
        )
)
@EnableFeignClients(basePackages = "com.songhg.firefly.iot.api.client")
@EnableScheduling
public class FireflyConnectorApplication {

    public static void main(String[] args) {
        SpringApplication.run(FireflyConnectorApplication.class, args);
    }
}
