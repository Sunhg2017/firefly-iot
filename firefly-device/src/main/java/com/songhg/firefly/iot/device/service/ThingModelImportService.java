package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.songhg.firefly.iot.api.client.AsyncTaskClient;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.AsyncTaskCreateDTO;
import com.songhg.firefly.iot.api.dto.AsyncTaskVO;
import com.songhg.firefly.iot.common.context.AsyncContextHelper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.product.ThingModelImportDTO;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.*;

/**
 * 物模型异步导入服务
 * <p>
 * 实现规则9：导入导出走异步任务中心，禁止前端解析文件。
 * 前端上传文件到MinIO后，使用fileKey注册异步导入任务，
 * 后端从MinIO读取文件并异步解析、更新物模型。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ThingModelImportService {

    private final ProductMapper productMapper;
    private final FileClient fileClient;
    private final AsyncTaskClient asyncTaskClient;
    private final ObjectMapper objectMapper;

    private static final int MAX_ERROR_MESSAGE_LENGTH = 500;

    /**
     * 注册物模型异步导入任务
     */
    public Long registerImportTask(Long productId, ThingModelImportDTO dto) {
        // 检查产品是否存在
        Product product = productMapper.selectById(productId);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }

        // 使用强类型 DTO 创建异步任务
        AsyncTaskCreateDTO createDTO = new AsyncTaskCreateDTO();
        createDTO.setTaskName("物模型导入: " + product.getName());
        createDTO.setTaskType("IMPORT");
        createDTO.setBizType("THING_MODEL_IMPORT");
        createDTO.setFileFormat(dto.getFileFormat());
        createDTO.setExtraData(productId + ":" + dto.getFileKey() + ":" + dto.getImportType());

        R<AsyncTaskVO> taskResult = asyncTaskClient.createTask(createDTO);
        if (taskResult == null || taskResult.getData() == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "创建导入任务失败");
        }

        Long taskId = taskResult.getData().getId();
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        // 异步执行导入
        executeImportAsync(taskId, productId, dto, tenantId, userId);

        log.info("物模型导入任务已注册: taskId={}, productId={}, fileKey={}", taskId, productId, dto.getFileKey());
        return taskId;
    }

    /**
     * 异步执行物模型导入
     */
    @Async
    @Transactional
    public void executeImportAsync(Long taskId, Long productId, ThingModelImportDTO dto, Long tenantId, Long userId) {
        try {
            AsyncContextHelper.setContext(tenantId, userId);

            asyncTaskClient.updateProgress(taskId, 10);

            // 获取文件预签名URL并下载
            R<Map<String, String>> presignedResult = fileClient.getPresignedUrl(dto.getFileKey());
            if (presignedResult == null || presignedResult.getData() == null) {
                throw new BizException(ResultCode.INTERNAL_ERROR, "获取文件URL失败");
            }
            String fileUrl = presignedResult.getData().get("url");

            asyncTaskClient.updateProgress(taskId, 30);

            // 获取当前产品
            Product product = productMapper.selectById(productId);
            if (product == null) {
                asyncTaskClient.failTask(taskId, "产品不存在");
                return;
            }

            // 下载并解析文件
            ObjectNode thingModel;
            if ("JSON".equalsIgnoreCase(dto.getFileFormat())) {
                thingModel = downloadAndParseJson(fileUrl);
            } else {
                thingModel = downloadAndParseExcel(fileUrl, dto.getImportType(), product.getThingModel());
            }

            asyncTaskClient.updateProgress(taskId, 70);

            // 更新物模型
            product.setThingModel(objectMapper.writeValueAsString(thingModel));
            productMapper.updateById(product);

            asyncTaskClient.updateProgress(taskId, 90);

            // 完成任务
            asyncTaskClient.completeTask(taskId, true, null, 1, null);
            log.info("物模型导入完成: taskId={}, productId={}", taskId, productId);

        } catch (Exception e) {
            log.error("物模型导入异常: taskId={}, error={}", taskId, e.getMessage(), e);
            asyncTaskClient.failTask(taskId, truncateMessage("导入失败: " + e.getMessage()));
        } finally {
            AsyncContextHelper.clearContext();
        }
    }

    /**
     * 截断过长的错误信息
     */
    private String truncateMessage(String message) {
        if (message == null) return null;
        return message.length() > MAX_ERROR_MESSAGE_LENGTH
                ? message.substring(0, MAX_ERROR_MESSAGE_LENGTH)
                : message;
    }

    /**
     * 下载并解析JSON文件
     */
    private ObjectNode downloadAndParseJson(String fileUrl) throws Exception {
        URI uri = new URI(fileUrl);
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        try (InputStream inputStream = conn.getInputStream();
             BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
            StringBuilder content = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                content.append(line);
            }
            JsonNode node = objectMapper.readTree(content.toString());
            if (!node.isObject()) {
                throw new BizException(ResultCode.BAD_REQUEST, "JSON文件格式错误，期望对象类型");
            }
            return (ObjectNode) node;
        }
    }

    /**
     * 下载并解析Excel文件，仅支持属性导入
     */
    private ObjectNode downloadAndParseExcel(String fileUrl, String importType, String currentThingModelJson) throws Exception {
        URI uri = new URI(fileUrl);
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        // 解析当前物模型
        ObjectNode thingModel;
        if (currentThingModelJson != null && !currentThingModelJson.isBlank()) {
            thingModel = (ObjectNode) objectMapper.readTree(currentThingModelJson);
        } else {
            thingModel = objectMapper.createObjectNode();
            thingModel.set("properties", objectMapper.createArrayNode());
            thingModel.set("events", objectMapper.createArrayNode());
            thingModel.set("services", objectMapper.createArrayNode());
        }

        try (InputStream inputStream = conn.getInputStream();
             Workbook workbook = new XSSFWorkbook(inputStream)) {

            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) {
                throw new BizException(ResultCode.BAD_REQUEST, "Excel文件中没有工作表");
            }

            // 解析属性列表
            List<ObjectNode> properties = parsePropertiesFromSheet(sheet);

            // 根据导入类型处理
            if ("FULL".equalsIgnoreCase(importType)) {
                // 完整替换
                thingModel.set("properties", objectMapper.valueToTree(properties));
            } else if ("MERGE".equalsIgnoreCase(importType)) {
                // 合并：添加新属性，保留现有属性
                ArrayNode existingProperties = thingModel.has("properties")
                        ? (ArrayNode) thingModel.get("properties")
                        : objectMapper.createArrayNode();
                Set<String> existingIds = new HashSet<>();
                existingProperties.forEach(p -> {
                    if (p.has("identifier")) {
                        existingIds.add(p.get("identifier").asText());
                    }
                });
                for (ObjectNode prop : properties) {
                    String identifier = prop.has("identifier") ? prop.get("identifier").asText() : null;
                    if (identifier != null && !existingIds.contains(identifier)) {
                        existingProperties.add(prop);
                    }
                }
            } else {
                // 默认：仅属性（替换属性，保留事件和服务）
                thingModel.set("properties", objectMapper.valueToTree(properties));
            }
        }

        return thingModel;
    }

    /**
     * 从Excel工作表解析属性列表
     */
    private List<ObjectNode> parsePropertiesFromSheet(Sheet sheet) {
        List<ObjectNode> properties = new ArrayList<>();

        Row headerRow = sheet.getRow(0);
        if (headerRow == null) {
            return properties;
        }

        // 读取表头
        Map<String, Integer> headerMap = new HashMap<>();
        for (int i = 0; i < headerRow.getLastCellNum(); i++) {
            Cell cell = headerRow.getCell(i);
            if (cell != null) {
                String header = getCellValueAsString(cell).toLowerCase().trim();
                headerMap.put(header, i);
            }
        }

        // 查找列索引
        Integer identifierCol = findColumn(headerMap, "identifier", "标识符", "code");
        Integer nameCol = findColumn(headerMap, "name", "名称", "属性名称");
        Integer typeCol = findColumn(headerMap, "type", "datatype", "数据类型", "类型");
        Integer accessModeCol = findColumn(headerMap, "accessmode", "access", "读写模式", "访问模式");
        Integer descriptionCol = findColumn(headerMap, "description", "描述", "说明");
        Integer unitCol = findColumn(headerMap, "unit", "单位");
        Integer minCol = findColumn(headerMap, "min", "最小值");
        Integer maxCol = findColumn(headerMap, "max", "最大值");

        if (identifierCol == null) {
            throw new BizException(ResultCode.BAD_REQUEST, "Excel文件中未找到标识符列(identifier)");
        }

        // 读取数据行
        for (int i = 1; i <= sheet.getLastRowNum(); i++) {
            Row row = sheet.getRow(i);
            if (row == null) continue;

            String identifier = getCellValueAsString(row.getCell(identifierCol)).trim();
            if (identifier.isEmpty()) continue;

            ObjectNode property = objectMapper.createObjectNode();
            property.put("identifier", identifier);
            property.put("name", nameCol != null ? getCellValueAsString(row.getCell(nameCol)).trim() : identifier);
            property.put("accessMode", accessModeCol != null
                    ? normalizeAccessMode(getCellValueAsString(row.getCell(accessModeCol)))
                    : "r");

            // 数据类型和规格
            String type = typeCol != null ? getCellValueAsString(row.getCell(typeCol)).trim().toLowerCase() : "string";
            ObjectNode dataType = objectMapper.createObjectNode();
            dataType.put("type", mapDataType(type));

            ObjectNode specs = objectMapper.createObjectNode();
            if (unitCol != null) {
                String unit = getCellValueAsString(row.getCell(unitCol)).trim();
                if (!unit.isEmpty()) specs.put("unit", unit);
            }
            if (minCol != null) {
                String min = getCellValueAsString(row.getCell(minCol)).trim();
                if (!min.isEmpty()) specs.put("min", min);
            }
            if (maxCol != null) {
                String max = getCellValueAsString(row.getCell(maxCol)).trim();
                if (!max.isEmpty()) specs.put("max", max);
            }
            if (specs.size() > 0) {
                dataType.set("specs", specs);
            }
            property.set("dataType", dataType);

            if (descriptionCol != null) {
                String desc = getCellValueAsString(row.getCell(descriptionCol)).trim();
                if (!desc.isEmpty()) property.put("description", desc);
            }

            properties.add(property);
        }

        return properties;
    }

    private Integer findColumn(Map<String, Integer> headerMap, String... aliases) {
        for (String alias : aliases) {
            Integer col = headerMap.get(alias.toLowerCase());
            if (col != null) return col;
        }
        return null;
    }

    private String getCellValueAsString(Cell cell) {
        if (cell == null) return "";
        return switch (cell.getCellType()) {
            case STRING -> cell.getStringCellValue();
            case NUMERIC -> String.valueOf((long) cell.getNumericCellValue());
            case BOOLEAN -> String.valueOf(cell.getBooleanCellValue());
            case FORMULA -> cell.getCellFormula();
            default -> "";
        };
    }

    private String normalizeAccessMode(String raw) {
        String mode = raw.trim().toLowerCase();
        if (mode.equals("rw") || mode.equals("读写") || mode.equals("readwrite")) {
            return "rw";
        }
        return "r";
    }

    private String mapDataType(String type) {
        return switch (type) {
            case "int", "integer", "整数" -> "int";
            case "long", "长整数" -> "long";
            case "float", "浮点", "单精度" -> "float";
            case "double", "双精度" -> "double";
            case "bool", "boolean", "布尔" -> "bool";
            case "date", "日期" -> "date";
            case "array", "数组" -> "array";
            case "struct", "结构体", "对象" -> "struct";
            case "enum", "枚举" -> "enum";
            default -> "string";
        };
    }
}
