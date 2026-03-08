package com.songhg.firefly.iot.gateway.route;

import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 动态路由配置：将 DynamicServiceRouteLocator 注册为 RouteDefinitionLocator Bean，
 * Gateway 自动合并它与 YAML 中的静态路由。
 */
@Configuration
public class DynamicRouteConfig {

    @Bean
    public RouteDefinitionLocator dynamicServiceRouteLocator(DiscoveryClient discoveryClient) {
        return new DynamicServiceRouteLocator(discoveryClient);
    }
}
