package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.Data;

/**
 * Modbus 寄存器定义（采集任务使用）
 */
@Data
public class ModbusRegisterDef {
    private String alias;
    private int functionCode = 3; // FC03 (holding) or FC04 (input)
    private int address;
    private int quantity = 1;
}
