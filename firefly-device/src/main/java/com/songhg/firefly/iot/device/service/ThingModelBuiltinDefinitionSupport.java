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
 * Maintains platform-required built-in thing model definitions.
 * <p>
 * Built-in properties and lifecycle events are part of the platform contract
 * and should always exist in every product thing model, regardless of whether
 * the model was created from scratch, edited manually, or imported
 * asynchronously.
 */
@Component
@RequiredArgsConstructor
public class ThingModelBuiltinDefinitionSupport {

    public static final List<String> BUILTIN_PROPERTY_IDENTIFIERS = List.of("ip");
    public static final List<String> BUILTIN_EVENT_IDENTIFIERS = List.of("online", "offline", "heartbeat");

    private final ObjectMapper objectMapper;

    public ObjectNode createDefaultThingModel() {
        ObjectNode root = objectMapper.createObjectNode();
        root.set("properties", buildBuiltinProperties());
        root.set("events", buildBuiltinEvents());
        root.set("services", objectMapper.createArrayNode());
        return root;
    }

    public ObjectNode ensureBuiltinDefinitions(ObjectNode root) {
        ArrayNode properties = ensureArray(root, "properties");
        ArrayNode events = ensureArray(root, "events");
        ArrayNode services = ensureArray(root, "services");

        ObjectNode normalized = root.deepCopy();
        normalized.set("properties", mergeBuiltinProperties(properties));
        normalized.set("events", mergeBuiltinEvents(events));
        normalized.set("services", mergeCustomServices(services));
        return normalized;
    }

    public boolean isBuiltinPropertyIdentifier(String identifier) {
        return identifier != null && BUILTIN_PROPERTY_IDENTIFIERS.contains(identifier.trim());
    }

    public boolean isBuiltinEventIdentifier(String identifier) {
        return identifier != null && BUILTIN_EVENT_IDENTIFIERS.contains(identifier.trim());
    }

    private ArrayNode ensureArray(ObjectNode root, String fieldName) {
        JsonNode field = root.get(fieldName);
        if (field instanceof ArrayNode arrayNode) {
            return arrayNode;
        }
        return objectMapper.createArrayNode();
    }

    private ArrayNode mergeBuiltinProperties(ArrayNode properties) {
        Map<String, JsonNode> customProperties = new LinkedHashMap<>();
        for (JsonNode property : properties) {
            if (!property.isObject()) {
                continue;
            }
            String identifier = property.path("identifier").asText("");
            if (BUILTIN_PROPERTY_IDENTIFIERS.contains(identifier)) {
                continue;
            }
            customProperties.putIfAbsent(identifier, property.deepCopy());
        }

        ArrayNode mergedProperties = buildBuiltinProperties();
        customProperties.values().forEach(mergedProperties::add);
        return mergedProperties;
    }

    private ArrayNode mergeBuiltinEvents(ArrayNode events) {
        Map<String, JsonNode> customEvents = new LinkedHashMap<>();
        for (JsonNode event : events) {
            if (!event.isObject()) {
                continue;
            }
            String identifier = event.path("identifier").asText("");
            if (BUILTIN_EVENT_IDENTIFIERS.contains(identifier)) {
                continue;
            }
            customEvents.putIfAbsent(identifier, event.deepCopy());
        }

        ArrayNode mergedEvents = buildBuiltinEvents();
        customEvents.values().forEach(mergedEvents::add);
        return mergedEvents;
    }

    private ArrayNode mergeCustomServices(ArrayNode services) {
        ArrayNode customServices = objectMapper.createArrayNode();
        for (JsonNode service : services) {
            if (!service.isObject()) {
                continue;
            }
            String identifier = service.path("identifier").asText("");
            if (BUILTIN_EVENT_IDENTIFIERS.contains(identifier)) {
                continue;
            }
            customServices.add(service.deepCopy());
        }
        return customServices;
    }

    private ArrayNode buildBuiltinProperties() {
        ArrayNode properties = objectMapper.createArrayNode();
        properties.add(createBuiltinProperty("ip", "IP地址", "设备当前网络地址"));
        return properties;
    }

    private ArrayNode buildBuiltinEvents() {
        ArrayNode events = objectMapper.createArrayNode();
        events.add(createBuiltinEvent("online", "上线", "设备连接建立后上报在线状态"));
        events.add(createBuiltinEvent("offline", "离线", "设备断开或超时后上报离线状态"));
        events.add(createBuiltinEvent("heartbeat", "心跳", "设备周期性保活，维持在线状态"));
        return events;
    }

    private ObjectNode createBuiltinProperty(String identifier, String name, String description) {
        ObjectNode property = objectMapper.createObjectNode();
        ObjectNode dataType = objectMapper.createObjectNode();
        dataType.put("type", "string");

        property.put("identifier", identifier);
        property.put("name", name);
        property.put("description", description);
        property.put("accessMode", "r");
        property.put("system", true);
        property.put("readonly", true);
        property.set("dataType", dataType);
        return property;
    }

    private ObjectNode createBuiltinEvent(String identifier, String name, String description) {
        ObjectNode event = objectMapper.createObjectNode();
        event.put("identifier", identifier);
        event.put("name", name);
        event.put("description", description);
        event.put("type", "info");
        event.put("system", true);
        event.put("readonly", true);
        event.put("lifecycle", true);
        event.set("outputData", objectMapper.createArrayNode());
        return event;
    }
}
