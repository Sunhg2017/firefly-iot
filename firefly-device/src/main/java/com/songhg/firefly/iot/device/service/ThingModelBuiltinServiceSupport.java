package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Maintains platform-required built-in thing model services.
 * <p>
 * Lifecycle services are part of the platform contract and should always exist
 * in every product thing model, regardless of whether the model was created
 * from scratch, edited manually, or imported asynchronously.
 */
@Component
@RequiredArgsConstructor
public class ThingModelBuiltinServiceSupport {

    public static final List<String> BUILTIN_SERVICE_IDENTIFIERS = List.of("online", "offline", "heartbeat");

    private final ObjectMapper objectMapper;

    public ObjectNode createDefaultThingModel() {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("properties", objectMapper.createArrayNode());
        root.set("events", objectMapper.createArrayNode());
        root.set("services", buildBuiltinServices());
        return root;
    }

    public ObjectNode ensureBuiltinServices(ObjectNode root) {
        ArrayNode properties = ensureArray(root, "properties");
        ArrayNode events = ensureArray(root, "events");
        ArrayNode services = ensureArray(root, "services");

        ObjectNode normalized = root.deepCopy();
        normalized.set("properties", properties);
        normalized.set("events", events);

        Map<String, JsonNode> customServices = new LinkedHashMap<>();
        for (JsonNode service : services) {
            if (!service.isObject()) {
                continue;
            }
            String identifier = service.path("identifier").asText("");
            if (BUILTIN_SERVICE_IDENTIFIERS.contains(identifier)) {
                continue;
            }
            customServices.putIfAbsent(identifier, service.deepCopy());
        }

        ArrayNode mergedServices = buildBuiltinServices();
        customServices.values().forEach(mergedServices::add);
        normalized.set("services", mergedServices);
        return normalized;
    }

    public boolean isBuiltinServiceIdentifier(String identifier) {
        return identifier != null && BUILTIN_SERVICE_IDENTIFIERS.contains(identifier.trim());
    }

    private ArrayNode ensureArray(ObjectNode root, String fieldName) {
        JsonNode field = root.get(fieldName);
        if (field instanceof ArrayNode arrayNode) {
            return arrayNode;
        }
        return objectMapper.createArrayNode();
    }

    private ArrayNode buildBuiltinServices() {
        ArrayNode services = objectMapper.createArrayNode();
        services.add(createBuiltinService("online", "上线", "设备连接建立后上报在线状态"));
        services.add(createBuiltinService("offline", "离线", "设备断开或超时后上报离线状态"));
        services.add(createBuiltinService("heartbeat", "心跳", "设备周期性保活，维持在线状态"));
        return services;
    }

    private ObjectNode createBuiltinService(String identifier, String name, String description) {
        ObjectNode service = objectMapper.createObjectNode();
        service.put("identifier", identifier);
        service.put("name", name);
        service.put("description", description);
        service.put("callType", "async");
        service.put("system", true);
        service.put("readonly", true);
        service.put("lifecycle", true);
        service.set("inputData", objectMapper.createArrayNode());
        service.set("outputData", objectMapper.createArrayNode());
        return service;
    }
}
