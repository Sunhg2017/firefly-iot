package com.songhg.firefly.iot.system.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.openapi.OpenApiOptionVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiDocAuthHeaderVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiDocFieldVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiDocItemVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiDocServiceVO;
import com.songhg.firefly.iot.system.dto.openapi.TenantOpenApiDocVO;
import com.songhg.firefly.iot.system.entity.OpenApiServiceDoc;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class TenantOpenApiDocService {

    private static final String API_DOCS_PATH = "/v3/api-docs";
    private static final Pattern PATH_VARIABLE_PATTERN = Pattern.compile("\\{([^}/]+)}");
    private static final int MAX_SCHEMA_DEPTH = 4;
    private static final List<String> PREFERRED_CONTENT_TYPES = List.of(
            "application/json",
            "application/*+json",
            "application/x-www-form-urlencoded",
            "multipart/form-data",
            "text/plain"
    );
    private static final Map<String, String> SERVICE_NAME_MAP = Map.of(
            "SYSTEM", "系统服务",
            "DEVICE", "设备服务",
            "DATA", "数据服务",
            "RULE", "规则服务",
            "SUPPORT", "支撑服务",
            "MEDIA", "媒体服务",
            "CONNECTOR", "连接器服务"
    );

    private final TenantOpenApiSubscriptionService tenantOpenApiSubscriptionService;
    private final OpenApiServiceDocService openApiServiceDocService;
    private final ObjectMapper objectMapper;

    public TenantOpenApiDocVO getCurrentTenantDocs() {
        Long tenantId = requireTenantId();
        List<OpenApiOptionVO> subscribedOptions = tenantOpenApiSubscriptionService.listSubscribedEnabledOptions(tenantId);

        Map<String, List<OpenApiOptionVO>> optionsByService = new LinkedHashMap<>();
        for (OpenApiOptionVO option : subscribedOptions) {
            optionsByService.computeIfAbsent(option.getServiceCode(), key -> new ArrayList<>()).add(option);
        }

        TenantOpenApiDocVO vo = new TenantOpenApiDocVO();
        vo.setGeneratedAt(LocalDateTime.now());
        vo.setSignatureAlgorithm("HMAC-SHA256");
        vo.setCanonicalRequestTemplate("HTTP_METHOD\\nSERVICE_CODE\\nREQUEST_PATH\\nCANONICAL_QUERY\\nBODY_SHA256\\nTIMESTAMP\\nNONCE");
        vo.setGatewayBasePathTemplate("{{gatewayBaseUrl}}/open/{SERVICE}/api/v1/...");
        vo.setAuthHeaders(buildAuthHeaders());

        List<TenantOpenApiDocServiceVO> services = new ArrayList<>();
        for (Map.Entry<String, List<OpenApiOptionVO>> entry : optionsByService.entrySet()) {
            services.add(buildServiceDoc(entry.getKey(), entry.getValue()));
        }
        vo.setServices(services);
        return vo;
    }

    private TenantOpenApiDocServiceVO buildServiceDoc(String serviceCode, List<OpenApiOptionVO> options) {
        TenantOpenApiDocServiceVO serviceVO = new TenantOpenApiDocServiceVO();
        serviceVO.setServiceCode(serviceCode);
        serviceVO.setServiceName(resolveServiceDisplayName(serviceCode));
        serviceVO.setApiCount(options.size());

        ServiceOpenApiSnapshot snapshot = loadPersistedServiceOpenApiSnapshot(serviceCode, serviceVO);
        if (snapshot == null) {
            serviceVO.setDocAvailable(false);
        } else {
            serviceVO.setDocAvailable(true);
        }

        List<TenantOpenApiDocItemVO> items = new ArrayList<>();
        options.stream()
                .sorted(Comparator.comparing(OpenApiOptionVO::getGatewayPath, Comparator.nullsLast(String::compareTo)))
                .forEach(option -> items.add(buildDocItem(option, snapshot)));
        serviceVO.setItems(items);
        return serviceVO;
    }

    private TenantOpenApiDocItemVO buildDocItem(OpenApiOptionVO option, ServiceOpenApiSnapshot snapshot) {
        TenantOpenApiDocItemVO item = new TenantOpenApiDocItemVO();
        item.setCode(option.getCode());
        item.setName(option.getName());
        item.setSummary(option.getName());
        item.setServiceCode(option.getServiceCode());
        item.setServiceName(resolveServiceDisplayName(option.getServiceCode()));
        item.setHttpMethod(option.getHttpMethod());
        item.setPathPattern(option.getPathPattern());
        item.setGatewayPath(option.getGatewayPath());
        item.setPermissionCode(option.getPermissionCode());
        item.setBodyRequired(false);
        item.setRequestContentTypes(List.of());
        item.setParameterFields(List.of());
        item.setRequestFields(List.of());
        item.setResponseFields(List.of());
        item.setWarnings(new ArrayList<>());
        item.setCurlExample(buildCurlExample(option, List.of(), null, null));

        if (snapshot == null) {
            item.getWarnings().add("当前服务最新 OpenAPI 文件尚未同步到系统，仅展示目录和网关地址。");
            return item;
        }

        JsonNode pathNode = snapshot.findPathNode(option.getPathPattern());
        JsonNode operationNode = snapshot.findOperationNode(option.getPathPattern(), option.getHttpMethod());
        if (operationNode.isMissingNode()) {
            item.getWarnings().add("最近一次同步的 OpenAPI 文件中未匹配到该接口详细模型，可能是服务尚未重新同步或注解未补齐。");
            return item;
        }

        item.setSummary(firstNonBlank(textOf(operationNode.path("summary")), option.getName()));
        item.setDescription(firstNonBlank(textOf(operationNode.path("description")), textOf(pathNode.path("summary"))));

        List<TenantOpenApiDocFieldVO> parameterFields = buildParameterFields(snapshot, pathNode, operationNode);
        item.setParameterFields(parameterFields);

        RequestBodyDoc requestBodyDoc = buildRequestBodyDoc(snapshot, operationNode);
        item.setRequestContentTypes(requestBodyDoc.contentTypes());
        item.setBodyRequired(requestBodyDoc.required());
        item.setRequestFields(requestBodyDoc.fields());
        item.setRequestExample(requestBodyDoc.example());

        ResponseBodyDoc responseBodyDoc = buildResponseBodyDoc(snapshot, operationNode);
        item.setSuccessStatus(responseBodyDoc.statusCode());
        item.setResponseContentType(responseBodyDoc.contentType());
        item.setResponseFields(responseBodyDoc.fields());
        item.setResponseExample(responseBodyDoc.example());

        item.setCurlExample(buildCurlExample(option, parameterFields, requestBodyDoc.contentType(), requestBodyDoc.example()));
        if (!StringUtils.hasText(item.getDescription())) {
            item.getWarnings().add("当前接口未补充详细说明，建议在 Controller 的 Swagger 注解中补齐 summary/description。");
        }
        return item;
    }

    private List<TenantOpenApiDocAuthHeaderVO> buildAuthHeaders() {
        List<TenantOpenApiDocAuthHeaderVO> headers = new ArrayList<>();
        headers.add(buildAuthHeader("X-App-Key", true, "AppKey 的 Access Key。", "{{accessKey}}"));
        headers.add(buildAuthHeader("X-Timestamp", true, "13 位毫秒时间戳，和服务端时间差不能超过签名窗口。", "{{timestamp}}"));
        headers.add(buildAuthHeader("X-Nonce", true, "8 到 128 位随机串，同一个 AppKey 下不能重复。", "{{nonce}}"));
        headers.add(buildAuthHeader("X-Signature", true, "按文档中的 Canonical Request 使用 Secret Key 计算的 HMAC-SHA256。", "{{signature}}"));
        return headers;
    }

    private TenantOpenApiDocAuthHeaderVO buildAuthHeader(String name, boolean required, String description, String example) {
        TenantOpenApiDocAuthHeaderVO header = new TenantOpenApiDocAuthHeaderVO();
        header.setName(name);
        header.setRequired(required);
        header.setDescription(description);
        header.setExample(example);
        return header;
    }

    private List<TenantOpenApiDocFieldVO> buildParameterFields(
            ServiceOpenApiSnapshot snapshot,
            JsonNode pathNode,
            JsonNode operationNode
    ) {
        Map<String, TenantOpenApiDocFieldVO> fields = new LinkedHashMap<>();
        appendParameterFields(fields, snapshot, pathNode.path("parameters"));
        appendParameterFields(fields, snapshot, operationNode.path("parameters"));
        return new ArrayList<>(fields.values());
    }

    private void appendParameterFields(
            Map<String, TenantOpenApiDocFieldVO> fields,
            ServiceOpenApiSnapshot snapshot,
            JsonNode parametersNode
    ) {
        if (!parametersNode.isArray()) {
            return;
        }
        for (JsonNode rawNode : parametersNode) {
            JsonNode parameterNode = snapshot.resolve(rawNode);
            if (!parameterNode.isObject()) {
                continue;
            }
            String name = textOf(parameterNode.path("name"));
            String location = textOf(parameterNode.path("in"));
            if (!StringUtils.hasText(name) || !StringUtils.hasText(location)) {
                continue;
            }
            JsonNode schemaNode = snapshot.resolve(parameterNode.path("schema"));

            TenantOpenApiDocFieldVO field = new TenantOpenApiDocFieldVO();
            field.setName(name);
            field.setLocation(location.toUpperCase(Locale.ROOT));
            field.setRequired(parameterNode.path("required").asBoolean(false));
            field.setType(resolveSchemaType(schemaNode, snapshot, new HashSet<>()));
            field.setDescription(firstNonBlank(textOf(parameterNode.path("description")), textOf(schemaNode.path("description"))));
            field.setExample(resolveInlineExample(parameterNode, schemaNode, snapshot));
            fields.put(location + ":" + name, field);
        }
    }

    private RequestBodyDoc buildRequestBodyDoc(ServiceOpenApiSnapshot snapshot, JsonNode operationNode) {
        JsonNode requestBodyNode = snapshot.resolve(operationNode.path("requestBody"));
        if (!requestBodyNode.isObject()) {
            return RequestBodyDoc.empty();
        }
        JsonNode contentNode = requestBodyNode.path("content");
        ContentSelection selection = selectContent(contentNode);
        if (selection == null) {
            return new RequestBodyDoc(listFieldNames(contentNode), null, requestBodyNode.path("required").asBoolean(false), List.of(), null);
        }

        List<TenantOpenApiDocFieldVO> fields = buildSchemaFields(selection.schemaNode(), "BODY", snapshot);
        String example = resolveContentExample(selection.contentNode(), selection.schemaNode(), snapshot);
        return new RequestBodyDoc(
                listFieldNames(contentNode),
                selection.contentType(),
                requestBodyNode.path("required").asBoolean(false),
                fields,
                example
        );
    }

    private ResponseBodyDoc buildResponseBodyDoc(ServiceOpenApiSnapshot snapshot, JsonNode operationNode) {
        JsonNode responsesNode = operationNode.path("responses");
        if (!responsesNode.isObject()) {
            return ResponseBodyDoc.empty();
        }

        Map.Entry<String, JsonNode> responseEntry = selectSuccessResponse(responsesNode);
        if (responseEntry == null) {
            return ResponseBodyDoc.empty();
        }

        JsonNode responseNode = snapshot.resolve(responseEntry.getValue());
        JsonNode contentNode = responseNode.path("content");
        ContentSelection selection = selectContent(contentNode);
        if (selection == null) {
            return new ResponseBodyDoc(responseEntry.getKey(), null, List.of(), null);
        }

        List<TenantOpenApiDocFieldVO> fields = buildSchemaFields(selection.schemaNode(), "RESPONSE", snapshot);
        String example = resolveContentExample(selection.contentNode(), selection.schemaNode(), snapshot);
        return new ResponseBodyDoc(responseEntry.getKey(), selection.contentType(), fields, example);
    }

    private List<TenantOpenApiDocFieldVO> buildSchemaFields(
            JsonNode rawSchemaNode,
            String location,
            ServiceOpenApiSnapshot snapshot
    ) {
        JsonNode schemaNode = snapshot.resolve(rawSchemaNode);
        if (!schemaNode.isObject()) {
            return List.of();
        }

        List<TenantOpenApiDocFieldVO> fields = new ArrayList<>();
        if (hasProperties(schemaNode) || hasComposedSchema(schemaNode)) {
            appendSchemaFields(fields, snapshot, schemaNode, "", location, false, 0, new LinkedHashSet<>());
            return fields;
        }

        TenantOpenApiDocFieldVO rootField = new TenantOpenApiDocFieldVO();
        rootField.setName("body");
        rootField.setLocation(location);
        rootField.setRequired(true);
        rootField.setType(resolveSchemaType(schemaNode, snapshot, new HashSet<>()));
        rootField.setDescription(textOf(schemaNode.path("description")));
        rootField.setExample(resolveSchemaExample(schemaNode, snapshot, new LinkedHashSet<>()));
        return List.of(rootField);
    }

    /**
     * 这里把 OpenAPI schema 拍平成字段路径列表，前端可以直接按“字段路径/类型/说明”渲染，
     * 不需要再次解析组件引用、allOf 和数组嵌套。
     */
    private void appendSchemaFields(
            List<TenantOpenApiDocFieldVO> fields,
            ServiceOpenApiSnapshot snapshot,
            JsonNode rawSchemaNode,
            String fieldPath,
            String location,
            boolean required,
            int depth,
            Set<String> visitingRefs
    ) {
        if (depth > MAX_SCHEMA_DEPTH) {
            return;
        }

        String ref = textOf(rawSchemaNode.path("$ref"));
        JsonNode schemaNode = snapshot.resolve(rawSchemaNode);
        if (!StringUtils.hasText(fieldPath) && !hasProperties(schemaNode) && !hasComposedSchema(schemaNode) && !schemaNode.path("items").isObject()) {
            return;
        }

        if (StringUtils.hasText(fieldPath)) {
            TenantOpenApiDocFieldVO field = new TenantOpenApiDocFieldVO();
            field.setName(fieldPath);
            field.setLocation(location);
            field.setRequired(required);
            field.setType(resolveSchemaType(schemaNode, snapshot, new HashSet<>(visitingRefs)));
            field.setDescription(textOf(schemaNode.path("description")));
            field.setExample(resolveSchemaExample(schemaNode, snapshot, new LinkedHashSet<>(visitingRefs)));
            fields.add(field);
        }

        if (StringUtils.hasText(ref) && !visitingRefs.add(ref)) {
            return;
        }

        if (schemaNode.path("allOf").isArray()) {
            for (JsonNode child : schemaNode.path("allOf")) {
                appendSchemaFields(fields, snapshot, child, fieldPath, location, required, depth + 1, visitingRefs);
            }
        }
        if (schemaNode.path("oneOf").isArray()) {
            for (JsonNode child : schemaNode.path("oneOf")) {
                appendSchemaFields(fields, snapshot, child, fieldPath, location, required, depth + 1, visitingRefs);
            }
        }
        if (schemaNode.path("anyOf").isArray()) {
            for (JsonNode child : schemaNode.path("anyOf")) {
                appendSchemaFields(fields, snapshot, child, fieldPath, location, required, depth + 1, visitingRefs);
            }
        }

        JsonNode propertiesNode = schemaNode.path("properties");
        Set<String> requiredNames = requiredNames(schemaNode.path("required"));
        if (propertiesNode.isObject()) {
            Iterator<Map.Entry<String, JsonNode>> iterator = propertiesNode.fields();
            while (iterator.hasNext()) {
                Map.Entry<String, JsonNode> entry = iterator.next();
                String childPath = StringUtils.hasText(fieldPath) ? fieldPath + "." + entry.getKey() : entry.getKey();
                appendSchemaFields(
                        fields,
                        snapshot,
                        entry.getValue(),
                        childPath,
                        location,
                        requiredNames.contains(entry.getKey()),
                        depth + 1,
                        new LinkedHashSet<>(visitingRefs)
                );
            }
        }

        JsonNode itemsNode = schemaNode.path("items");
        if (itemsNode.isObject()) {
            String arrayPath = StringUtils.hasText(fieldPath) ? fieldPath + "[]" : "items[]";
            appendSchemaFields(
                    fields,
                    snapshot,
                    itemsNode,
                    arrayPath,
                    location,
                    true,
                    depth + 1,
                    new LinkedHashSet<>(visitingRefs)
            );
        }

        JsonNode additionalPropertiesNode = schemaNode.path("additionalProperties");
        if (additionalPropertiesNode.isObject()) {
            String mapPath = StringUtils.hasText(fieldPath) ? fieldPath + ".*" : "properties.*";
            appendSchemaFields(
                    fields,
                    snapshot,
                    additionalPropertiesNode,
                    mapPath,
                    location,
                    false,
                    depth + 1,
                    new LinkedHashSet<>(visitingRefs)
            );
        }
    }

    private String resolveSchemaType(JsonNode rawSchemaNode, ServiceOpenApiSnapshot snapshot, Set<String> visitingRefs) {
        if (!rawSchemaNode.isObject()) {
            return "-";
        }

        String ref = textOf(rawSchemaNode.path("$ref"));
        if (StringUtils.hasText(ref) && !visitingRefs.add(ref)) {
            return simpleRefName(ref);
        }

        JsonNode schemaNode = snapshot.resolve(rawSchemaNode);
        if (!schemaNode.isObject()) {
            return "-";
        }

        String type = textOf(schemaNode.path("type"));
        if (!StringUtils.hasText(type)) {
            if (schemaNode.path("properties").isObject() || schemaNode.path("additionalProperties").isObject()) {
                type = "object";
            } else if (schemaNode.path("items").isObject()) {
                type = "array";
            } else if (hasComposedSchema(schemaNode)) {
                type = "object";
            } else if (StringUtils.hasText(ref)) {
                type = simpleRefName(ref);
            }
        }

        if ("array".equals(type)) {
            return "array<" + resolveSchemaType(schemaNode.path("items"), snapshot, new HashSet<>(visitingRefs)) + ">";
        }
        if ("string".equals(type) && StringUtils.hasText(textOf(schemaNode.path("format")))) {
            return "string(" + textOf(schemaNode.path("format")) + ")";
        }
        return StringUtils.hasText(type) ? type : "-";
    }

    private String resolveInlineExample(JsonNode parameterNode, JsonNode schemaNode, ServiceOpenApiSnapshot snapshot) {
        String example = valueToText(parameterNode.path("example"));
        if (StringUtils.hasText(example)) {
            return example;
        }
        example = resolveFirstNamedExample(parameterNode.path("examples"));
        if (StringUtils.hasText(example)) {
            return example;
        }
        return resolveSchemaExample(schemaNode, snapshot, new LinkedHashSet<>());
    }

    private String resolveContentExample(JsonNode contentNode, JsonNode schemaNode, ServiceOpenApiSnapshot snapshot) {
        String example = valueToText(contentNode.path("example"));
        if (StringUtils.hasText(example)) {
            return example;
        }
        example = resolveFirstNamedExample(contentNode.path("examples"));
        if (StringUtils.hasText(example)) {
            return example;
        }

        Object generated = generateExampleValue(snapshot.resolve(schemaNode), snapshot, 0, new LinkedHashSet<>());
        if (generated == null) {
            return null;
        }
        try {
            if (generated instanceof String text) {
                return text;
            }
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(generated);
        } catch (JsonProcessingException e) {
            return generated.toString();
        }
    }

    private String resolveSchemaExample(JsonNode rawSchemaNode, ServiceOpenApiSnapshot snapshot, Set<String> visitingRefs) {
        if (!rawSchemaNode.isObject()) {
            return null;
        }

        String example = valueToText(rawSchemaNode.path("example"));
        if (StringUtils.hasText(example)) {
            return example;
        }
        example = valueToText(rawSchemaNode.path("default"));
        if (StringUtils.hasText(example)) {
            return example;
        }
        JsonNode enumNode = rawSchemaNode.path("enum");
        if (enumNode.isArray() && enumNode.size() > 0) {
            return valueToText(enumNode.get(0));
        }

        Object generated = generateExampleValue(snapshot.resolve(rawSchemaNode), snapshot, 0, visitingRefs);
        if (generated == null) {
            return null;
        }
        if (generated instanceof String text) {
            return text;
        }
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(generated);
        } catch (JsonProcessingException e) {
            return generated.toString();
        }
    }

    private Object generateExampleValue(
            JsonNode rawSchemaNode,
            ServiceOpenApiSnapshot snapshot,
            int depth,
            Set<String> visitingRefs
    ) {
        if (depth > MAX_SCHEMA_DEPTH || !rawSchemaNode.isObject()) {
            return null;
        }

        String ref = textOf(rawSchemaNode.path("$ref"));
        if (StringUtils.hasText(ref) && !visitingRefs.add(ref)) {
            return simpleRefName(ref);
        }

        String inlineExample = valueToText(rawSchemaNode.path("example"));
        if (StringUtils.hasText(inlineExample)) {
            return normalizeExampleValue(rawSchemaNode.path("example"));
        }
        if (rawSchemaNode.hasNonNull("default")) {
            return normalizeExampleValue(rawSchemaNode.path("default"));
        }
        JsonNode enumNode = rawSchemaNode.path("enum");
        if (enumNode.isArray() && enumNode.size() > 0) {
            return normalizeExampleValue(enumNode.get(0));
        }

        JsonNode schemaNode = snapshot.resolve(rawSchemaNode);
        String type = textOf(schemaNode.path("type"));
        if (!StringUtils.hasText(type)) {
            if (schemaNode.path("properties").isObject() || hasComposedSchema(schemaNode)) {
                type = "object";
            } else if (schemaNode.path("items").isObject()) {
                type = "array";
            }
        }

        if ("object".equals(type)) {
            Map<String, Object> example = new LinkedHashMap<>();
            if (schemaNode.path("allOf").isArray()) {
                for (JsonNode child : schemaNode.path("allOf")) {
                    Object childValue = generateExampleValue(child, snapshot, depth + 1, new LinkedHashSet<>(visitingRefs));
                    if (childValue instanceof Map<?, ?> mapValue) {
                        mapValue.forEach((key, value) -> example.put(String.valueOf(key), value));
                    }
                }
            }

            JsonNode propertiesNode = schemaNode.path("properties");
            if (propertiesNode.isObject()) {
                Iterator<Map.Entry<String, JsonNode>> iterator = propertiesNode.fields();
                while (iterator.hasNext()) {
                    Map.Entry<String, JsonNode> entry = iterator.next();
                    Object childExample = generateExampleValue(entry.getValue(), snapshot, depth + 1, new LinkedHashSet<>(visitingRefs));
                    example.put(entry.getKey(), childExample);
                }
            } else if (schemaNode.path("additionalProperties").isObject()) {
                example.put("key", generateExampleValue(schemaNode.path("additionalProperties"), snapshot, depth + 1, new LinkedHashSet<>(visitingRefs)));
            }
            return example.isEmpty() ? Map.of() : example;
        }

        if ("array".equals(type)) {
            Object itemExample = generateExampleValue(schemaNode.path("items"), snapshot, depth + 1, new LinkedHashSet<>(visitingRefs));
            return List.of(itemExample);
        }

        if ("integer".equals(type) || "number".equals(type)) {
            return 1;
        }
        if ("boolean".equals(type)) {
            return true;
        }
        if ("string".equals(type)) {
            String format = textOf(schemaNode.path("format"));
            if ("date-time".equals(format)) {
                return "2026-03-21T10:00:00";
            }
            if ("date".equals(format)) {
                return "2026-03-21";
            }
            if ("uuid".equals(format)) {
                return "123e4567-e89b-12d3-a456-426614174000";
            }
            if ("binary".equals(format)) {
                return "<binary>";
            }
            return "string";
        }

        if (schemaNode.path("oneOf").isArray() && schemaNode.path("oneOf").size() > 0) {
            return generateExampleValue(schemaNode.path("oneOf").get(0), snapshot, depth + 1, new LinkedHashSet<>(visitingRefs));
        }
        if (schemaNode.path("anyOf").isArray() && schemaNode.path("anyOf").size() > 0) {
            return generateExampleValue(schemaNode.path("anyOf").get(0), snapshot, depth + 1, new LinkedHashSet<>(visitingRefs));
        }

        return null;
    }

    private Object normalizeExampleValue(JsonNode exampleNode) {
        if (exampleNode == null || exampleNode.isMissingNode() || exampleNode.isNull()) {
            return null;
        }
        if (exampleNode.isTextual()) {
            String text = exampleNode.asText();
            if (looksLikeJson(text)) {
                try {
                    return objectMapper.readValue(text, Object.class);
                } catch (JsonProcessingException ignored) {
                    return text;
                }
            }
            return text;
        }
        return objectMapper.convertValue(exampleNode, Object.class);
    }

    private ContentSelection selectContent(JsonNode contentNode) {
        if (!contentNode.isObject()) {
            return null;
        }
        for (String contentType : PREFERRED_CONTENT_TYPES) {
            JsonNode selectedNode = contentNode.path(contentType);
            if (selectedNode.isObject()) {
                return new ContentSelection(contentType, selectedNode, selectedNode.path("schema"));
            }
        }
        Iterator<Map.Entry<String, JsonNode>> iterator = contentNode.fields();
        if (iterator.hasNext()) {
            Map.Entry<String, JsonNode> entry = iterator.next();
            return new ContentSelection(entry.getKey(), entry.getValue(), entry.getValue().path("schema"));
        }
        return null;
    }

    private Map.Entry<String, JsonNode> selectSuccessResponse(JsonNode responsesNode) {
        for (String statusCode : List.of("200", "201", "202", "203", "204")) {
            JsonNode responseNode = responsesNode.path(statusCode);
            if (responseNode.isObject()) {
                return Map.entry(statusCode, responseNode);
            }
        }

        Iterator<Map.Entry<String, JsonNode>> iterator = responsesNode.fields();
        while (iterator.hasNext()) {
            Map.Entry<String, JsonNode> entry = iterator.next();
            if (entry.getKey().startsWith("2")) {
                return entry;
            }
        }

        JsonNode defaultNode = responsesNode.path("default");
        if (defaultNode.isObject()) {
            return Map.entry("default", defaultNode);
        }
        return null;
    }

    private String buildCurlExample(
            OpenApiOptionVO option,
            List<TenantOpenApiDocFieldVO> parameterFields,
            String requestContentType,
            String requestExample
    ) {
        String method = firstNonBlank(option.getHttpMethod(), "GET").toUpperCase(Locale.ROOT);
        String url = buildRequestUrl(option.getGatewayPath(), parameterFields);
        List<String> lines = new ArrayList<>();
        lines.add("curl --request " + method + " \\");
        lines.add("  --url '" + url + "' \\");
        lines.add("  --header 'X-App-Key: {{accessKey}}' \\");
        lines.add("  --header 'X-Timestamp: {{timestamp}}' \\");
        lines.add("  --header 'X-Nonce: {{nonce}}' \\");
        lines.add("  --header 'X-Signature: {{signature}}' \\");

        parameterFields.stream()
                .filter(field -> "HEADER".equalsIgnoreCase(field.getLocation()))
                .filter(field -> !equalsAnyIgnoreCase(field.getName(), List.of("X-App-Key", "X-Timestamp", "X-Nonce", "X-Signature")))
                .forEach(field -> lines.add("  --header '" + field.getName() + ": {{" + field.getName() + "}}' \\"));

        boolean hasBody = StringUtils.hasText(requestExample) && !Set.of("GET", "DELETE").contains(method);
        if (hasBody && StringUtils.hasText(requestContentType)) {
            lines.add("  --header 'Content-Type: " + requestContentType + "' \\");
        }
        if (hasBody) {
            lines.add("  --data-raw '" + escapeForCurl(requestExample) + "'");
        } else {
            int index = lines.size() - 1;
            lines.set(index, lines.get(index).substring(0, lines.get(index).length() - 2));
        }
        return String.join("\n", lines);
    }

    private String buildRequestUrl(String gatewayPath, List<TenantOpenApiDocFieldVO> parameterFields) {
        String normalizedPath = StringUtils.hasText(gatewayPath) ? gatewayPath : "/";
        Matcher matcher = PATH_VARIABLE_PATTERN.matcher(normalizedPath);
        StringBuffer buffer = new StringBuffer();
        while (matcher.find()) {
            matcher.appendReplacement(buffer, "{{" + matcher.group(1) + "}}");
        }
        matcher.appendTail(buffer);

        StringBuilder urlBuilder = new StringBuilder("{{gatewayBaseUrl}}").append(buffer);
        List<String> queryPlaceholders = parameterFields.stream()
                .filter(field -> "QUERY".equalsIgnoreCase(field.getLocation()))
                .map(field -> field.getName() + "={{" + field.getName() + "}}")
                .toList();
        if (!queryPlaceholders.isEmpty()) {
            urlBuilder.append('?').append(String.join("&", queryPlaceholders));
        }
        return urlBuilder.toString();
    }

    private ServiceOpenApiSnapshot loadPersistedServiceOpenApiSnapshot(String serviceCode, TenantOpenApiDocServiceVO serviceVO) {
        OpenApiServiceDoc snapshotEntity = openApiServiceDocService.getSnapshot(serviceCode);
        if (snapshotEntity == null || !StringUtils.hasText(snapshotEntity.getApiDocJson())) {
            serviceVO.setErrorMessage("当前服务还没有同步过 OpenAPI 文件，请先等待服务完成一次自动注册。");
            return null;
        }
        serviceVO.setDocSyncedAt(snapshotEntity.getSyncedAt());
        try {
            return new ServiceOpenApiSnapshot(objectMapper.readTree(snapshotEntity.getApiDocJson()));
        } catch (JsonProcessingException ex) {
            log.warn("Failed to parse persisted OpenAPI file for serviceCode={}", serviceCode, ex);
            serviceVO.setErrorMessage("系统中保存的 OpenAPI 文件解析失败，请让对应服务重新同步。");
            return null;
        }
    }

    private String resolveServiceDisplayName(String serviceCode) {
        return SERVICE_NAME_MAP.getOrDefault(serviceCode, serviceCode + " 服务");
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "tenant context required");
        }
        return tenantId;
    }

    private boolean hasProperties(JsonNode schemaNode) {
        return schemaNode.path("properties").isObject() && schemaNode.path("properties").size() > 0;
    }

    private boolean hasComposedSchema(JsonNode schemaNode) {
        return schemaNode.path("allOf").isArray() || schemaNode.path("oneOf").isArray() || schemaNode.path("anyOf").isArray();
    }

    private Set<String> requiredNames(JsonNode requiredNode) {
        if (!requiredNode.isArray()) {
            return Set.of();
        }
        Set<String> values = new LinkedHashSet<>();
        for (JsonNode item : requiredNode) {
            if (item.isTextual()) {
                values.add(item.asText());
            }
        }
        return values;
    }

    private String resolveFirstNamedExample(JsonNode examplesNode) {
        if (!examplesNode.isObject()) {
            return null;
        }
        Iterator<Map.Entry<String, JsonNode>> iterator = examplesNode.fields();
        while (iterator.hasNext()) {
            JsonNode exampleNode = iterator.next().getValue();
            String value = valueToText(exampleNode.path("value"));
            if (StringUtils.hasText(value)) {
                return value;
            }
        }
        return null;
    }

    private List<String> listFieldNames(JsonNode objectNode) {
        if (!objectNode.isObject()) {
            return List.of();
        }
        List<String> result = new ArrayList<>();
        objectNode.fieldNames().forEachRemaining(result::add);
        return result;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (StringUtils.hasText(value)) {
                return value.trim();
            }
        }
        return null;
    }

    private String textOf(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        String value = node.asText();
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private String valueToText(JsonNode node) {
        if (node == null || node.isMissingNode() || node.isNull()) {
            return null;
        }
        if (node.isTextual()) {
            return node.asText();
        }
        try {
            return objectMapper.writerWithDefaultPrettyPrinter().writeValueAsString(objectMapper.convertValue(node, Object.class));
        } catch (JsonProcessingException e) {
            return node.toString();
        }
    }

    private boolean looksLikeJson(String value) {
        String trimmed = value == null ? "" : value.trim();
        return trimmed.startsWith("{") || trimmed.startsWith("[");
    }

    private boolean equalsAnyIgnoreCase(String value, List<String> candidates) {
        if (!StringUtils.hasText(value)) {
            return false;
        }
        return candidates.stream().anyMatch(candidate -> value.equalsIgnoreCase(candidate));
    }

    private String simpleRefName(String ref) {
        if (!StringUtils.hasText(ref)) {
            return "-";
        }
        int index = ref.lastIndexOf('/');
        return index >= 0 ? ref.substring(index + 1) : ref;
    }

    private String escapeForCurl(String value) {
        return value.replace("\\", "\\\\").replace("'", "'\"'\"'");
    }

    private record ContentSelection(String contentType, JsonNode contentNode, JsonNode schemaNode) {
    }

    private record RequestBodyDoc(
            List<String> contentTypes,
            String contentType,
            boolean required,
            List<TenantOpenApiDocFieldVO> fields,
            String example
    ) {
        private static RequestBodyDoc empty() {
            return new RequestBodyDoc(List.of(), null, false, List.of(), null);
        }
    }

    private record ResponseBodyDoc(
            String statusCode,
            String contentType,
            List<TenantOpenApiDocFieldVO> fields,
            String example
    ) {
        private static ResponseBodyDoc empty() {
            return new ResponseBodyDoc(null, null, List.of(), null);
        }
    }

    private static final class ServiceOpenApiSnapshot {

        private final JsonNode rootNode;

        private ServiceOpenApiSnapshot(JsonNode rootNode) {
            this.rootNode = rootNode == null ? MissingNode.getInstance() : rootNode;
        }

        private JsonNode findPathNode(String pathPattern) {
            JsonNode pathsNode = rootNode.path("paths");
            if (!pathsNode.isObject()) {
                return MissingNode.getInstance();
            }
            JsonNode exactNode = pathsNode.path(normalizePath(pathPattern));
            if (exactNode.isObject()) {
                return exactNode;
            }
            String trimmed = trimTrailingSlash(normalizePath(pathPattern));
            JsonNode trimmedNode = pathsNode.path(trimmed);
            if (trimmedNode.isObject()) {
                return trimmedNode;
            }
            return MissingNode.getInstance();
        }

        private JsonNode findOperationNode(String pathPattern, String httpMethod) {
            JsonNode pathNode = findPathNode(pathPattern);
            if (!pathNode.isObject()) {
                return MissingNode.getInstance();
            }
            String method = httpMethod == null ? "" : httpMethod.toLowerCase(Locale.ROOT);
            JsonNode operationNode = pathNode.path(method);
            return operationNode.isObject() ? resolve(operationNode) : MissingNode.getInstance();
        }

        private JsonNode resolve(JsonNode node) {
            JsonNode current = node == null ? MissingNode.getInstance() : node;
            Set<String> visitedRefs = new HashSet<>();
            while (current.isObject() && current.has("$ref")) {
                String ref = current.path("$ref").asText();
                if (!StringUtils.hasText(ref) || !visitedRefs.add(ref)) {
                    return MissingNode.getInstance();
                }
                current = resolveRef(ref);
            }
            return current;
        }

        private JsonNode resolveRef(String ref) {
            if (!StringUtils.hasText(ref) || !ref.startsWith("#/")) {
                return MissingNode.getInstance();
            }
            String pointer = ref.substring(1);
            JsonNode resolved = rootNode.at(pointer);
            return resolved.isMissingNode() ? MissingNode.getInstance() : resolved;
        }

        private static String normalizePath(String value) {
            if (!StringUtils.hasText(value)) {
                return "/";
            }
            return value.startsWith("/") ? value : "/" + value;
        }

        private static String trimTrailingSlash(String value) {
            if (!StringUtils.hasText(value) || "/".equals(value)) {
                return value;
            }
            return value.endsWith("/") ? value.substring(0, value.length() - 1) : value;
        }
    }
}
