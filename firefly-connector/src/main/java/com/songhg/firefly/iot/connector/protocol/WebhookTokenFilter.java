package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.connector.config.LoRaWanProperties;
import com.songhg.firefly.iot.connector.config.MqttProperties;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * 设备侧 webhook 令牌校验：外部 MQTT Broker 回调和 LoRaWAN 网络服务器回调
 * 在配置了令牌时必须携带 {@code X-Webhook-Token}，避免任意来源伪造设备上行。
 * 未配置令牌时保持兼容（仅告警），生产环境应显式配置。
 */
@Slf4j
@Component
@RequiredArgsConstructor
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public class WebhookTokenFilter extends OncePerRequestFilter {

    private static final String WEBHOOK_TOKEN_HEADER = "X-Webhook-Token";

    private final MqttProperties mqttProperties;
    private final LoRaWanProperties loRaWanProperties;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        String expected = resolveExpectedToken(path);
        if (StringUtils.hasText(expected)) {
            String provided = request.getHeader(WEBHOOK_TOKEN_HEADER);
            byte[] expectedBytes = expected.getBytes(StandardCharsets.UTF_8);
            byte[] providedBytes = (provided == null ? "" : provided).getBytes(StandardCharsets.UTF_8);
            if (!MessageDigest.isEqual(expectedBytes, providedBytes)) {
                log.warn("Rejected webhook request with invalid token: {} {}", request.getMethod(), path);
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                return;
            }
        }
        filterChain.doFilter(request, response);
    }

    private String resolveExpectedToken(String path) {
        if (path.startsWith("/api/v1/protocol/mqtt/")) {
            return mqttProperties.getWebhookToken();
        }
        if (path.startsWith("/api/v1/lorawan/webhook/")) {
            return loRaWanProperties.getWebhookToken();
        }
        return null;
    }
}
