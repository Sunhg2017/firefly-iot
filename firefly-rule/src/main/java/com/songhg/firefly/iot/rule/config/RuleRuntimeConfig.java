package com.songhg.firefly.iot.rule.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.net.http.HttpClient;
import java.time.Duration;

@Configuration
public class RuleRuntimeConfig {

    @Bean(name = "ruleRuntimeHttpClient")
    public HttpClient ruleRuntimeHttpClient() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .build();
    }
}
