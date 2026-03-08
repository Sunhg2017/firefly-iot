package com.songhg.firefly.iot.gateway.route;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.cloud.client.discovery.DiscoveryClient;
import org.springframework.cloud.gateway.filter.FilterDefinition;
import org.springframework.cloud.gateway.handler.predicate.PredicateDefinition;
import org.springframework.cloud.gateway.route.RouteDefinition;
import org.springframework.cloud.gateway.route.RouteDefinitionLocator;
import reactor.core.publisher.Flux;

import java.net.URI;
import java.util.ArrayList;
import java.util.List;

/**
 * 基于服务名的动态路由定位器。
 * <p>
 * 自动从 Nacos 注册中心发现所有 firefly-* 服务，
 * 按约定生成路由规则：
 * <pre>
 *   /{SHORTNAME}/api/v1/** → lb://firefly-{shortName}
 * </pre>
 * 其中 SHORTNAME 是去掉 "firefly-" 前缀后的服务名（全大写）。
 * Gateway 通过 RewritePath 将 /{SHORTNAME}/api/(.*) 重写为 /api/$1，
 * 下游服务不需要做任何路径改动。
 */
@Slf4j
@RequiredArgsConstructor
public class DynamicServiceRouteLocator implements RouteDefinitionLocator {

    private static final String SERVICE_PREFIX = "firefly-";

    private final DiscoveryClient discoveryClient;

    @Override
    public Flux<RouteDefinition> getRouteDefinitions() {
        List<RouteDefinition> routes = new ArrayList<>();

        List<String> services = discoveryClient.getServices();
        for (String service : services) {
            if (!service.startsWith(SERVICE_PREFIX)) {
                continue;
            }
            // firefly-gateway 自身不需要路由
            if ("firefly-gateway".equals(service)) {
                continue;
            }

            String shortName = service.substring(SERVICE_PREFIX.length()); // e.g. "device", "rule"
            String upperName = shortName.toUpperCase(); // e.g. "DEVICE", "RULE"

            RouteDefinition route = new RouteDefinition();
            route.setId("dynamic-" + service);
            route.setUri(URI.create("lb://" + service));

            // Predicate: /{SHORTNAME}/api/**
            PredicateDefinition predicate = new PredicateDefinition();
            predicate.setName("Path");
            predicate.addArg("pattern", "/" + upperName + "/api/**");
            route.setPredicates(List.of(predicate));

            // Filter: RewritePath /{SHORTNAME}/api/(?<segment>.*) → /api/$\{segment}
            FilterDefinition rewriteFilter = new FilterDefinition();
            rewriteFilter.setName("RewritePath");
            rewriteFilter.addArg("regexp", "/" + upperName + "/api/(?<segment>.*)");
            rewriteFilter.addArg("replacement", "/api/${segment}");
            route.setFilters(List.of(rewriteFilter));

            // 低优先级，让 YAML 中的静态路由优先匹配
            route.setOrder(100);

            routes.add(route);
            log.info("Dynamic route registered: /{}/api/** → lb://{}", upperName, service);
        }

        return Flux.fromIterable(routes);
    }
}
