package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.api.client.AsyncTaskClient;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.api.dto.AsyncTaskCreateDTO;
import com.songhg.firefly.iot.api.dto.AsyncTaskVO;
import com.songhg.firefly.iot.api.dto.DeviceLocatorInputDTO;
import com.songhg.firefly.iot.common.context.AsyncContextHelper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceBatchCreateItemDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceImportDTO;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.apache.poi.ss.usermodel.*;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URI;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Locale;

/**
 * 设备异步导入服务
 * <p>
 * 实现规则9：导入导出走异步任务中心，禁止前端解析文件。
 * 前端上传文件到MinIO后，使用fileKey注册异步导入任务，
 * 后端从MinIO读取文件并异步解析、批量创建设备。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceImportService {

    private final DeviceService deviceService;
    private final FileClient fileClient;
    private final AsyncTaskClient asyncTaskClient;

    private static final int BATCH_SIZE = 100;
    private static final String DEVICE_NAME_PATTERN = "^[a-zA-Z0-9_\\-\\.]{4,64}$";
    private static final int MAX_ERROR_MESSAGE_LENGTH = 500;

    /**
     * 注册设备异步导入任务
     * <p>
     * 创建异步任务后立即返回taskId，后台异步执行文件解析和设备创建。
     *
     * @param dto 导入请求
     * @return 异步任务ID
     */
    public Long registerImportTask(DeviceImportDTO dto) {
        // 使用强类型 DTO 创建异步任务
        AsyncTaskCreateDTO createDTO = new AsyncTaskCreateDTO();
        createDTO.setTaskName("设备批量导入");
        createDTO.setTaskType("IMPORT");
        createDTO.setBizType("DEVICE_IMPORT");
        createDTO.setFileFormat(dto.getFileFormat());
        createDTO.setExtraData(dto.getFileKey());

        R<AsyncTaskVO> taskResult = asyncTaskClient.createTask(createDTO);
        if (taskResult == null || taskResult.getData() == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "创建导入任务失败");
        }

        Long taskId = taskResult.getData().getId();
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        // 异步执行导入
        executeImportAsync(taskId, dto, tenantId, userId);

        log.info("设备导入任务已注册: taskId={}, fileKey={}", taskId, dto.getFileKey());
        return taskId;
    }

    /**
     * 异步执行设备导入
     */
    @Async
    public void executeImportAsync(Long taskId, DeviceImportDTO dto, Long tenantId, Long userId) {
        try {
            // 设置上下文（异步线程中需要重新设置）
            AsyncContextHelper.setContext(tenantId, userId);

            asyncTaskClient.updateProgress(taskId, 10);

            // 获取文件预签名URL并下载
            R<Map<String, String>> presignedResult = fileClient.getPresignedUrl(dto.getFileKey());
            if (presignedResult == null || presignedResult.getData() == null) {
                throw new BizException(ResultCode.INTERNAL_ERROR, "获取文件URL失败");
            }
            String fileUrl = presignedResult.getData().get("url");

            asyncTaskClient.updateProgress(taskId, 20);

            // 下载并解析文件
            List<DeviceBatchCreateItemDTO> devices = downloadAndParseFile(fileUrl, dto.getFileFormat());
            if (devices.isEmpty()) {
                asyncTaskClient.failTask(taskId, "导入文件中没有可识别的设备数据");
                return;
            }

            asyncTaskClient.updateProgress(taskId, 40);

            // 批量创建设备
            int successCount = 0;
            int failCount = 0;
            List<String> errors = new ArrayList<>();

            for (int i = 0; i < devices.size(); i += BATCH_SIZE) {
                int end = Math.min(i + BATCH_SIZE, devices.size());
                List<DeviceBatchCreateItemDTO> batch = devices.subList(i, end);

                try {
                    DeviceBatchCreateDTO batchDTO = new DeviceBatchCreateDTO();
                    batchDTO.setProductId(dto.getProductId());
                    batchDTO.setProjectId(dto.getProjectId());
                    batchDTO.setDevices(batch);
                    batchDTO.setDescription(dto.getDescription());
                    batchDTO.setTagIds(dto.getTagIds());
                    batchDTO.setGroupIds(dto.getGroupIds());

                    deviceService.batchCreateDevices(batchDTO);
                    successCount += batch.size();
                } catch (Exception e) {
                    failCount += batch.size();
                    errors.add("第 " + (i + 1) + "-" + end + " 行: " + e.getMessage());
                    log.warn("批量导入失败: rows {}-{}, error={}", i + 1, end, e.getMessage());
                }

                // 更新进度
                int progress = 40 + (int) ((double) (i + batch.size()) / devices.size() * 50);
                asyncTaskClient.updateProgress(taskId, Math.min(progress, 90));
            }

            // 完成任务
            if (failCount == 0) {
                asyncTaskClient.completeTask(taskId, true, null, null, successCount, null);
                log.info("设备导入完成: taskId={}, successCount={}", taskId, successCount);
            } else if (successCount > 0) {
                String errorMsg = "部分导入成功: " + successCount + " 成功, " + failCount + " 失败";
                asyncTaskClient.completeTask(taskId, true, null, null, successCount, errorMsg);
                log.warn("设备导入部分完成: taskId={}, success={}, fail={}", taskId, successCount, failCount);
            } else {
                String errorMsg = "导入失败: " + String.join("; ", errors);
                asyncTaskClient.failTask(taskId, truncateMessage(errorMsg));
                log.error("设备导入失败: taskId={}, errors={}", taskId, errors);
            }

        } catch (Exception e) {
            log.error("设备导入异常: taskId={}, error={}", taskId, e.getMessage(), e);
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
     * 下载并解析文件
     */
    private List<DeviceBatchCreateItemDTO> downloadAndParseFile(String fileUrl, String fileFormat) throws Exception {
        URI uri = new URI(fileUrl);
        HttpURLConnection conn = (HttpURLConnection) uri.toURL().openConnection();
        conn.setRequestMethod("GET");
        conn.setConnectTimeout(30000);
        conn.setReadTimeout(60000);

        try (InputStream inputStream = conn.getInputStream()) {
            if ("CSV".equalsIgnoreCase(fileFormat)) {
                return parseCsv(inputStream);
            } else {
                return parseExcel(inputStream);
            }
        }
    }

    /**
     * 解析Excel文件
     */
    private List<DeviceBatchCreateItemDTO> parseExcel(InputStream inputStream) throws Exception {
        List<DeviceBatchCreateItemDTO> devices = new ArrayList<>();

        try (Workbook workbook = new XSSFWorkbook(inputStream)) {
            Sheet sheet = workbook.getSheetAt(0);
            if (sheet == null) {
                throw new BizException(ResultCode.BAD_REQUEST, "Excel文件中没有工作表");
            }

            // 读取表头
            Row headerRow = sheet.getRow(0);
            if (headerRow == null) {
                throw new BizException(ResultCode.BAD_REQUEST, "Excel文件中没有表头行");
            }

            Map<String, Integer> headerMap = new HashMap<>();
            for (int i = 0; i < headerRow.getLastCellNum(); i++) {
                Cell cell = headerRow.getCell(i);
                if (cell != null) {
                    String header = getCellValueAsString(cell).toLowerCase().trim();
                    headerMap.put(header, i);
                }
            }

            // 确定设备名称和别名列的索引
            Integer deviceNameCol = findColumn(headerMap, "devicename", "device", "name", "设备名称", "设备编码", "mac", "sn");
            Integer nicknameCol = findColumn(headerMap, "nickname", "alias", "displayname", "设备别名", "别名", "显示名称");
            Integer locatorTypeCol = findColumn(headerMap, "locatortype", "locator_type", "标识类型", "设备标识类型");
            Integer locatorValueCol = findColumn(headerMap, "locatorvalue", "locator_value", "标识值", "设备标识值", "设备标识");
            Integer primaryLocatorCol = findColumn(headerMap, "primarylocator", "primary_locator", "主标识");
            Integer imeiCol = findColumn(headerMap, "imei");
            Integer iccidCol = findColumn(headerMap, "iccid");
            Integer macLocatorCol = findColumn(headerMap, "mac");
            Integer serialCol = findColumn(headerMap, "serial", "serialnumber", "serial_no", "序列号", "sn");

            if (deviceNameCol == null) {
                throw new BizException(ResultCode.BAD_REQUEST, "Excel文件中未找到设备名称列(deviceName)");
            }

            // 读取数据行
            for (int i = 1; i <= sheet.getLastRowNum(); i++) {
                Row row = sheet.getRow(i);
                if (row == null) continue;

                String deviceName = getCellValueAsString(row.getCell(deviceNameCol)).trim();
                if (deviceName.isEmpty()) continue;

                // 验证设备名称格式
                if (!deviceName.matches(DEVICE_NAME_PATTERN)) {
                    log.warn("无效的设备名称: row={}, deviceName={}", i + 1, deviceName);
                    continue;
                }

                DeviceBatchCreateItemDTO item = new DeviceBatchCreateItemDTO();
                item.setDeviceName(deviceName);
                if (nicknameCol != null) {
                    String nickname = getCellValueAsString(row.getCell(nicknameCol)).trim();
                    if (!nickname.isEmpty()) {
                        item.setNickname(nickname);
                    }
                }
                item.setLocators(buildImportLocators(
                        i + 1,
                        locatorTypeCol == null ? null : getCellValueAsString(row.getCell(locatorTypeCol)),
                        locatorValueCol == null ? null : getCellValueAsString(row.getCell(locatorValueCol)),
                        primaryLocatorCol == null ? null : getCellValueAsString(row.getCell(primaryLocatorCol)),
                        imeiCol == null ? null : getCellValueAsString(row.getCell(imeiCol)),
                        iccidCol == null ? null : getCellValueAsString(row.getCell(iccidCol)),
                        macLocatorCol == null ? null : getCellValueAsString(row.getCell(macLocatorCol)),
                        serialCol == null ? null : getCellValueAsString(row.getCell(serialCol))
                ));
                devices.add(item);
            }
        }

        return devices;
    }

    /**
     * 解析CSV文件
     */
    private List<DeviceBatchCreateItemDTO> parseCsv(InputStream inputStream) throws Exception {
        List<DeviceBatchCreateItemDTO> devices = new ArrayList<>();

        try (BufferedReader reader = new BufferedReader(new InputStreamReader(inputStream))) {
            String headerLine = reader.readLine();
            if (headerLine == null) {
                throw new BizException(ResultCode.BAD_REQUEST, "CSV文件为空");
            }

            // 解析表头
            String[] headers = headerLine.split(",");
            Map<String, Integer> headerMap = new HashMap<>();
            for (int i = 0; i < headers.length; i++) {
                headerMap.put(headers[i].toLowerCase().trim().replace("\"", ""), i);
            }

            Integer deviceNameCol = findColumn(headerMap, "devicename", "device", "name", "设备名称", "设备编码", "mac", "sn");
            Integer nicknameCol = findColumn(headerMap, "nickname", "alias", "displayname", "设备别名", "别名", "显示名称");
            Integer locatorTypeCol = findColumn(headerMap, "locatortype", "locator_type", "标识类型", "设备标识类型");
            Integer locatorValueCol = findColumn(headerMap, "locatorvalue", "locator_value", "标识值", "设备标识值", "设备标识");
            Integer primaryLocatorCol = findColumn(headerMap, "primarylocator", "primary_locator", "主标识");
            Integer imeiCol = findColumn(headerMap, "imei");
            Integer iccidCol = findColumn(headerMap, "iccid");
            Integer macLocatorCol = findColumn(headerMap, "mac");
            Integer serialCol = findColumn(headerMap, "serial", "serialnumber", "serial_no", "序列号", "sn");

            if (deviceNameCol == null) {
                throw new BizException(ResultCode.BAD_REQUEST, "CSV文件中未找到设备名称列(deviceName)");
            }

            // 读取数据行
            String line;
            int rowNum = 1;
            while ((line = reader.readLine()) != null) {
                rowNum++;
                String[] values = line.split(",");
                if (values.length <= deviceNameCol) continue;

                String deviceName = values[deviceNameCol].trim().replace("\"", "");
                if (deviceName.isEmpty()) continue;

                if (!deviceName.matches(DEVICE_NAME_PATTERN)) {
                    log.warn("无效的设备名称: row={}, deviceName={}", rowNum, deviceName);
                    continue;
                }

                DeviceBatchCreateItemDTO item = new DeviceBatchCreateItemDTO();
                item.setDeviceName(deviceName);
                if (nicknameCol != null && values.length > nicknameCol) {
                    String nickname = values[nicknameCol].trim().replace("\"", "");
                    if (!nickname.isEmpty()) {
                        item.setNickname(nickname);
                    }
                }
                item.setLocators(buildImportLocators(
                        rowNum,
                        readCsvCell(values, locatorTypeCol),
                        readCsvCell(values, locatorValueCol),
                        readCsvCell(values, primaryLocatorCol),
                        readCsvCell(values, imeiCol),
                        readCsvCell(values, iccidCol),
                        readCsvCell(values, macLocatorCol),
                        readCsvCell(values, serialCol)
                ));
                devices.add(item);
            }
        }

        return devices;
    }

    /**
     * 从多个可能的列名中查找列索引
     */
    private Integer findColumn(Map<String, Integer> headerMap, String... aliases) {
        for (String alias : aliases) {
            Integer col = headerMap.get(alias.toLowerCase());
            if (col != null) return col;
        }
        return null;
    }

    /**
     * 获取单元格的字符串值
     */
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

    private String readCsvCell(String[] values, Integer index) {
        if (index == null || index < 0 || index >= values.length) {
            return null;
        }
        return values[index].trim().replace("\"", "");
    }

    private List<DeviceLocatorInputDTO> buildImportLocators(int rowNum,
                                                            String locatorTypeText,
                                                            String locatorValueText,
                                                            String primaryLocatorText,
                                                            String imeiText,
                                                            String iccidText,
                                                            String macText,
                                                            String serialText) {
        List<DeviceLocatorInputDTO> locators = new ArrayList<>();

        appendLocator(locators, "IMEI", imeiText, false);
        appendLocator(locators, "ICCID", iccidText, false);
        appendLocator(locators, "MAC", macText, false);
        appendLocator(locators, "SERIAL", serialText, false);

        String locatorType = trim(locatorTypeText);
        String locatorValue = trim(locatorValueText);
        if (!locatorType.isEmpty() || !locatorValue.isEmpty()) {
            if (locatorType.isEmpty() || locatorValue.isEmpty()) {
                throw new BizException(ResultCode.BAD_REQUEST, "第 " + rowNum + " 行标识类型和标识值必须同时填写");
            }
            appendLocator(locators, locatorType, locatorValue, parsePrimaryLocator(primaryLocatorText));
        }

        if (locators.size() == 1 && locators.get(0).getPrimaryLocator() == null) {
            locators.get(0).setPrimaryLocator(true);
        }
        return locators.isEmpty() ? null : locators;
    }

    private void appendLocator(List<DeviceLocatorInputDTO> locators,
                               String locatorType,
                               String locatorValue,
                               Boolean primaryLocator) {
        String normalizedValue = trim(locatorValue);
        if (normalizedValue.isEmpty()) {
            return;
        }
        DeviceLocatorInputDTO locator = new DeviceLocatorInputDTO();
        locator.setLocatorType(trim(locatorType).toUpperCase(Locale.ROOT));
        locator.setLocatorValue(normalizedValue);
        locator.setPrimaryLocator(primaryLocator);
        locators.add(locator);
    }

    private Boolean parsePrimaryLocator(String value) {
        String normalized = trim(value).toLowerCase(Locale.ROOT);
        if (normalized.isEmpty()) {
            return null;
        }
        return "true".equals(normalized)
                || "1".equals(normalized)
                || "yes".equals(normalized)
                || "y".equals(normalized)
                || "是".equals(normalized)
                || "主".equals(normalized);
    }

    private String trim(String value) {
        return value == null ? "" : value.trim();
    }
}
