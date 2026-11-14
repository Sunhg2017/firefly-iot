package com.songhg.firefly.iot.rule.dataforward.executor;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;
import com.songhg.firefly.iot.rule.dataforward.support.ForwardTemplateRenderer;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.Locale;
import java.util.Map;

/**
 * TSDB 写入执行器：把设备数据写入外部时序库。
 * 支持 InfluxDB v2（line protocol）与 TDengine（RESTful SQL），走无状态 HTTP。
 */
@Slf4j
@Component
public class TsdbForwardExecutor implements DataForwardTargetExecutor {

    private final ObjectMapper objectMapper;
    private final ForwardTemplateRenderer renderer;
    private final HttpClient httpClient;

    public TsdbForwardExecutor(ObjectMapper objectMapper,
                               ForwardTemplateRenderer renderer,
                               @Qualifier("ruleRuntimeHttpClient") HttpClient httpClient) {
        this.objectMapper = objectMapper;
        this.renderer = renderer;
        this.httpClient = httpClient;
    }

    @Override
    public DataForwardTargetType type() {
        return DataForwardTargetType.TSDB;
    }

    @Override
    public void execute(DataForwardRule rule, DeviceMessage message, Map<String, Object> variables) throws Exception {
        JsonNode config = parseConfig(rule.getTargetConfig());
        String engine = renderer.requiredText(config, "engine", variables).toUpperCase(Locale.ROOT);
        String url = renderer.requiredText(config, "url", variables);
        switch (engine) {
            case "INFLUXDB" -> writeInfluxDb(config, url, variables);
            case "TDENGINE" -> writeTdEngine(config, url, variables);
            default -> throw new IllegalStateException("Unsupported TSDB engine: " + engine);
        }
    }

    private void writeInfluxDb(JsonNode config, String url, Map<String, Object> variables) throws Exception {
        String token = renderer.textOrNull(config, "token", variables);
        String org = renderer.requiredText(config, "org", variables);
        String bucket = renderer.requiredText(config, "bucket", variables);
        String measurement = renderer.requiredText(config, "measurement", variables);

        String writeUrl = url + "/api/v2/write?org=" + encode(org) + "&bucket=" + encode(bucket);
        String body = buildLineProtocol(measurement, config.get("tags"), config.get("fields"), variables);

        HttpRequest.Builder builder = HttpRequest.newBuilder()
                .uri(URI.create(writeUrl))
                .timeout(Duration.ofSeconds(10))
                .header("Content-Type", "text/plain; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        if (token != null && !token.isEmpty()) {
            builder.header("Authorization", "Token " + token);
        }
        send(builder.build());
    }

    private void writeTdEngine(JsonNode config, String url, Map<String, Object> variables) throws Exception {
        String user = renderer.requiredText(config, "user", variables);
        String password = renderer.textOrDefault(config, "password", "", variables);
        String database = renderer.requiredText(config, "database", variables);
        String sqlTemplate = renderer.requiredText(config, "sqlTemplate", variables);

        String sql = renderer.render(sqlTemplate, variables);
        String auth = "Basic " + Base64.getEncoder()
                .encodeToString((user + ":" + password).getBytes(StandardCharsets.UTF_8));

        HttpRequest request = HttpRequest.newBuilder()
                .uri(URI.create(url + "/rest/sql/" + encode(database)))
                .timeout(Duration.ofSeconds(10))
                .header("Authorization", auth)
                .header("Content-Type", "text/plain; charset=utf-8")
                .POST(HttpRequest.BodyPublishers.ofString(sql, StandardCharsets.UTF_8))
                .build();
        send(request);
    }

    private void send(HttpRequest request) throws Exception {
        HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        if (response.statusCode() >= 400) {
            throw new IllegalStateException("TSDB write returned HTTP " + response.statusCode());
        }
    }

    private String buildLineProtocol(String measurement, JsonNode tagsNode, JsonNode fieldsNode,
                                     Map<String, Object> variables) {
        StringBuilder line = new StringBuilder(escapeTagValue(measurement));
        if (tagsNode != null && !tagsNode.isNull() && tagsNode.isObject()) {
            tagsNode.fields().forEachRemaining(entry ->
                    line.append(',')
                            .append(escapeTagValue(entry.getKey()))
                            .append('=')
                            .append(escapeTagValue(renderer.render(entry.getValue().asText(), variables))));
        }
        line.append(' ');
        if (fieldsNode == null || fieldsNode.isNull() || !fieldsNode.isObject()) {
            throw new IllegalStateException("fields is required for InfluxDB line protocol");
        }
        StringBuilder fields = new StringBuilder();
        fieldsNode.fields().forEachRemaining(entry -> {
            if (fields.length() > 0) {
                fields.append(',');
            }
            fields.append(escapeTagValue(entry.getKey()))
                    .append('=')
                    .append(formatFieldValue(renderer.render(entry.getValue().asText(), variables)));
        });
        return line.append(fields).toString();
    }

    private String formatFieldValue(String raw) {
        if (raw == null) {
            return "\"\"";
        }
        if ("true".equalsIgnoreCase(raw) || "false".equalsIgnoreCase(raw)) {
            return raw.toLowerCase(Locale.ROOT);
        }
        try {
            Double.parseDouble(raw);
            return raw;
        } catch (NumberFormatException ignored) {
            return "\"" + raw.replace("\\", "\\\\").replace("\"", "\\\"") + "\"";
        }
    }

    private String escapeTagValue(String value) {
        if (value == null) {
            return "";
        }
        return value.replace("\\", "\\\\").replace(",", "\\,").replace(" ", "\\ ").replace("=", "\\=");
    }

    private String encode(String value) {
        return java.net.URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private JsonNode parseConfig(String raw) throws Exception {
        return objectMapper.readTree(raw == null ? "{}" : raw);
    }
}
