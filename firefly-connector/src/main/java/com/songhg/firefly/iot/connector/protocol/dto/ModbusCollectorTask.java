package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.Data;

import java.util.List;

/**
 * Modbus 采集任务定义
 */
@Data
public class ModbusCollectorTask {
    private String taskId;
    private ModbusTarget target;
    private List<ModbusRegisterDef> registers;
    private long intervalMs;
    private Long tenantId;
    private Long productId;
    private Long deviceId;
    private String deviceName;
}
