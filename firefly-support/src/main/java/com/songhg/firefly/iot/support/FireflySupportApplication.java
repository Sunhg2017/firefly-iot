package com.songhg.firefly.iot.support;

import org.mybatis.spring.annotation.MapperScan;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.cloud.openfeign.EnableFeignClients;
import org.springframework.context.annotation.ComponentScan;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
@EnableFeignClients(basePackages = "com.songhg.firefly.iot.api.client")
@ComponentScan(basePackages = {"com.songhg.firefly.iot.support", "com.songhg.firefly.iot.common"})
@MapperScan({"com.songhg.firefly.iot.support.mapper", "com.songhg.firefly.iot.support.notification.mapper"})
public class FireflySupportApplication {

    public static void main(String[] args) {
        SpringApplication.run(FireflySupportApplication.class, args);
    }
}
