package com.songhg.firefly.iot.connector.protocol.dto;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

/**
 * SNMP 连接目标参数
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class SnmpTarget {
    private String host;
    @Builder.Default
    private int port = 161;
    @Builder.Default
    private int version = 2; // 1, 2 (v2c), 3
    @Builder.Default
    private String community = "public";
    // v3 fields (future)
    private String securityName;
    private String authProtocol;
    private String authPassphrase;
    private String privProtocol;
    private String privPassphrase;
}
