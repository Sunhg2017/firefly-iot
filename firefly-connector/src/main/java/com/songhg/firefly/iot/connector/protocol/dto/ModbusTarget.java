package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * Modbus TCP 连接目标参数
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class ModbusTarget {
    private String host;
    @Builder.Default
    private int port = 502;
    @Builder.Default
    private int slaveId = 1;
    @Builder.Default
    private String mode = "TCP"; // TCP or RTU_OVER_TCP
}
