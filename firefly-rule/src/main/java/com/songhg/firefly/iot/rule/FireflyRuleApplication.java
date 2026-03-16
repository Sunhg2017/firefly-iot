package com.songhg.firefly.iot.rule;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableFeignClients(basePackages = "com.songhg.firefly.iot.api.client")
@ComponentScan(basePackages = {"com.songhg.firefly.iot.rule", "com.songhg.firefly.iot.common"})
@MapperScan({
        "com.songhg.firefly.iot.rule.mapper",
        "com.songhg.firefly.iot.common.mybatis.scope"
})
public class FireflyRuleApplication {

    public static void main(String[] args) {
        SpringApplication.run(FireflyRuleApplication.class, args);
    }
}
