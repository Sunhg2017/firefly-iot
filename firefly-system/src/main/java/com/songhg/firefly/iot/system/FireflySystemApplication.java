package com.songhg.firefly.iot.system;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableFeignClients(basePackages = "com.songhg.firefly.iot.api.client")
@ComponentScan(basePackages = {"com.songhg.firefly.iot.system", "com.songhg.firefly.iot.common"})
@MapperScan({"com.songhg.firefly.iot.system.mapper", "com.songhg.firefly.iot.system.auth.mapper"})
public class FireflySystemApplication {

    public static void main(String[] args) {
        SpringApplication.run(FireflySystemApplication.class, args);
    }
}
