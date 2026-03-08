package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * SNMP 采集任务定义
 */
@Data
public class SnmpCollectorTask {
    private String taskId;
    private SnmpTarget target;
    private List<String> oids;
    private Map<String, String> oidAliases;
    private long intervalMs;
    private Long tenantId;
    private Long productId;
    private Long deviceId;
    private String deviceName;
}
