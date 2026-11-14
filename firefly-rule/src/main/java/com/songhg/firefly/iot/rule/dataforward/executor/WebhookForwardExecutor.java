package com.songhg.firefly.iot.rule.dataforward.executor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import com.songhg.firefly.iot.rule.dataforward.support.ForwardTemplateRenderer;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;

@Component
public class WebhookForwardExecutor implements DataForwardTargetExecutor {

    private final ObjectMapper objectMapper;
    private final ForwardTemplateRenderer renderer;
    private final HttpClient httpClient;

    public WebhookForwardExecutor(ObjectMapper objectMapper,
                                  ForwardTemplateRenderer renderer,
                                  @Qualifier("ruleRuntimeHttpClient") HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.renderer = renderer;
        this.httpClient = httpClient;
    }

    @Override
    public DataForwardTargetType type() {
        return DataForwardTargetType.WEBHOOK;
    }

    @Override
    public void execute(DataForwardRule rule, DeviceMessage message, Map<String, Object> variables) throws Exception {
        JsonNode config = parseConfig(rule.getTargetConfig());
        String url = renderer.requiredText(config, "url", variables);
        String method = renderer.textOrDefault(config, "method", "POST", variables).toUpperCase(Locale.ROOT);

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(config.path("timeoutSeconds").asInt(10)));

        Map<String, String> headers = renderHeaders(config.get("headers"), variables);
        headers.forEach(builder::header);

        JsonNode bodyNode = config.get("body");
        if (bodyNode == null || bodyNode.isNull()) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            Object body = renderer.renderJsonValue(bodyNode, variables);
            String content = body instanceof String ? (String) body : renderer.writeJson(body);
            if (!headers.containsKey("Content-Type")) {
                builder.header("Content-Type", "application/json; charset=UTF-8");
            }
            builder.method(method, HttpRequest.BodyPublishers.ofString(content, StandardCharsets.UTF_8));
        }

        HttpResponse<String> response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() >= 400) {
            throw new IllegalStateException("Webhook returned HTTP " + response.statusCode());
        }
    }

    private JsonNode parseConfig(String raw) throws Exception {
        return objectMapper.readTree(raw == null ? "{}" : raw);
    }

    private Map<String, String> renderHeaders(JsonNode node, Map<String, Object> variables) {
        Map<String, String> result = new LinkedHashMap<>();
        if (node == null || node.isNull()) {
            return result;
        }
        node.fields().forEachRemaining(entry ->
                result.put(entry.getKey(), renderer.render(String.valueOf(entry.getValue().asText()), variables)));
        return result;
    }
}
