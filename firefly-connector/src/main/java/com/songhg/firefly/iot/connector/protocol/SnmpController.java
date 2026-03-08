package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.dto.SnmpCollectorTask;
import com.songhg.firefly.iot.connector.protocol.dto.SnmpTarget;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * SNMP 操作接口 — 提供 SNMP 连接测试、GET、WALK、采集任务管理
 */
@Tag(name = "SNMP 设备接入", description = "SNMP GET / WALK / Trap / 采集任务管理")
@RestController
@RequestMapping("/api/v1/snmp")
@RequiredArgsConstructor
public class SnmpController {

    private final SnmpService snmpService;
    private final SnmpCollectorService collectorService;

    // ==================== Connection Test ====================

    @Operation(summary = "测试 SNMP 连接")
    @PostMapping("/test")
    public R<Boolean> testConnection(@RequestBody SnmpTargetDTO dto) {
        return R.ok(snmpService.testConnection(toTarget(dto)));
    }

    // ==================== System Info ====================

    @Operation(summary = "获取设备系统信息 (sysDescr, sysName, sysUpTime 等)")
    @PostMapping("/system-info")
    public R<Map<String, String>> getSystemInfo(@RequestBody SnmpTargetDTO dto) throws Exception {
        return R.ok(snmpService.getSystemInfo(toTarget(dto)));
    }

    // ==================== SNMP GET ====================

    @Operation(summary = "SNMP GET 操作")
    @PostMapping("/get")
    public R<Map<String, String>> snmpGet(@RequestBody SnmpGetDTO dto) throws Exception {
        return R.ok(snmpService.get(toTarget(dto.getTarget()), dto.getOids()));
    }

    // ==================== SNMP WALK ====================

    @Operation(summary = "SNMP WALK 操作")
    @PostMapping("/walk")
    public R<Map<String, String>> snmpWalk(@RequestBody SnmpWalkDTO dto) throws Exception {
        return R.ok(snmpService.walk(toTarget(dto.getTarget()), dto.getRootOid()));
    }

    // ==================== Collector Management ====================

    @Operation(summary = "注册 SNMP 采集任务")
    @PostMapping("/collectors")
    public R<Void> registerCollector(@RequestBody CollectorRegisterDTO dto) {
        SnmpCollectorTask task = new SnmpCollectorTask();
        task.setTaskId(dto.getTaskId());
        task.setTarget(toTarget(dto.getTarget()));
        task.setOids(dto.getOids());
        task.setOidAliases(dto.getOidAliases());
        task.setIntervalMs(dto.getIntervalMs());
        task.setTenantId(dto.getTenantId());
        task.setProductId(dto.getProductId());
        task.setDeviceId(dto.getDeviceId());
        task.setDeviceName(dto.getDeviceName());
        collectorService.register(task);
        return R.ok();
    }

    @Operation(summary = "注销 SNMP 采集任务")
    @DeleteMapping("/collectors/{taskId}")
    public R<Void> unregisterCollector(
            @Parameter(description = "待移除采集任务编号", required = true) @PathVariable String taskId) {
        collectorService.unregister(taskId);
        return R.ok();
    }

    @Operation(summary = "查询所有采集任务")
    @GetMapping("/collectors")
    public R<Collection<SnmpCollectorTask>> listCollectors() {
        return R.ok(collectorService.listTasks());
    }

    @Operation(summary = "检查采集任务是否运行中")
    @GetMapping("/collectors/{taskId}/status")
    public R<Boolean> collectorStatus(
            @Parameter(description = "待检查采集任务编号", required = true) @PathVariable String taskId) {
        return R.ok(collectorService.isRunning(taskId));
    }

    // ==================== DTOs ====================

    private SnmpTarget toTarget(SnmpTargetDTO dto) {
        return SnmpTarget.builder()
                .host(dto.getHost())
                .port(dto.getPort() > 0 ? dto.getPort() : 161)
                .version(dto.getVersion() > 0 ? dto.getVersion() : 2)
                .community(dto.getCommunity() != null ? dto.getCommunity() : "public")
                .securityName(dto.getSecurityName())
                .authProtocol(dto.getAuthProtocol())
                .authPassphrase(dto.getAuthPassphrase())
                .privProtocol(dto.getPrivProtocol())
                .privPassphrase(dto.getPrivPassphrase())
                .build();
    }

    @Data
    @Schema(description = "目标设备连接参数")
    public static class SnmpTargetDTO {
        /** Target device IP or hostname */
        @Schema(description = "目标主机地址", example = "192.168.1.1")
        private String host;

        /** SNMP port (default 161) */
        @Schema(description = "通信端口", example = "161")
        private int port = 161;

        /** SNMP version: 1, 2 (v2c), or 3 */
        @Schema(description = "协议版本", example = "2")
        private int version = 2;

        /** Community string (v1/v2c only) */
        @Schema(description = "团体字串", example = "public")
        private String community = "public";

        /** SNMPv3 security name (username) */
        @Schema(description = "安全名称")
        private String securityName;

        /** SNMPv3 authentication protocol: MD5, SHA */
        @Schema(description = "认证协议")
        private String authProtocol;

        /** SNMPv3 authentication passphrase */
        @Schema(description = "认证口令")
        private String authPassphrase;

        /** SNMPv3 privacy protocol: DES, AES128 */
        @Schema(description = "加密协议")
        private String privProtocol;

        /** SNMPv3 privacy passphrase */
        @Schema(description = "加密口令")
        private String privPassphrase;
    }

    @Data
    @Schema(description = "获取请求")
    public static class SnmpGetDTO {
        /** Target device connection params */
        @Schema(description = "目标设备")
        private SnmpTargetDTO target;

        /** List of OIDs to read */
        @Schema(description = "待读取对象标识列表", example = "[\"1.3.6.1.2.1.1.1.0\", \"1.3.6.1.2.1.1.3.0\"]")
        private List<String> oids;
    }

    @Data
    @Schema(description = "遍历请求")
    public static class SnmpWalkDTO {
        /** Target device connection params */
        @Schema(description = "目标设备")
        private SnmpTargetDTO target;

        /** Root OID to walk from */
        @Schema(description = "遍历起始对象标识", example = "1.3.6.1.2.1.1")
        private String rootOid;
    }

    @Data
    @Schema(description = "采集任务注册请求")
    public static class CollectorRegisterDTO {
        /** Unique task identifier */
        @Schema(description = "任务唯一标识", example = "snmp-task-001")
        private String taskId;

        /** Target device connection params */
        @Schema(description = "目标设备")
        private SnmpTargetDTO target;

        /** OIDs to collect periodically */
        @Schema(description = "待采集对象标识列表")
        private List<String> oids;

        /** OID → friendly name mapping */
        @Schema(description = "对象标识别名映射")
        private Map<String, String> oidAliases;

        /** Collection interval in milliseconds */
        @Schema(description = "采集间隔毫秒数", example = "30000")
        private long intervalMs;

        /** Tenant ID for the collected data */
        @Schema(description = "租户编号")
        private Long tenantId;

        /** Product ID for the device */
        @Schema(description = "产品编号")
        private Long productId;

        /** Device ID in the platform */
        @Schema(description = "设备编号")
        private Long deviceId;

        /** Device display name */
        @Schema(description = "设备名称", example = "switch-01")
        private String deviceName;
    }
}
