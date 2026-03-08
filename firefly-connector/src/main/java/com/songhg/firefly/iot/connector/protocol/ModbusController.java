package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusCollectorTask;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusRegisterDef;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusTarget;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.EqualsAndHashCode;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.List;

/**
 * Modbus 操作接口 — 提供 Modbus TCP 连接测试、寄存器读写、采集任务管理
 */
@Tag(name = "Modbus 设备接入", description = "Modbus TCP 读写寄存器 (FC01-FC06, FC15, FC16) + 采集任务")
@RestController
@RequestMapping("/api/v1/modbus")
@RequiredArgsConstructor
public class ModbusController {

    private final ModbusService modbusService;
    private final ModbusCollectorService collectorService;

    // ==================== Connection Test ====================

    @Operation(summary = "测试 Modbus 连接")
    @PostMapping("/test")
    public R<Boolean> testConnection(@RequestBody ModbusTargetDTO dto) {
        return R.ok(modbusService.testConnection(toTarget(dto)));
    }

    // ==================== Read Operations ====================

    @Operation(summary = "读取保持寄存器 (FC03)")
    @PostMapping("/read-holding-registers")
    public R<List<Integer>> readHoldingRegisters(@RequestBody ModbusReadDTO dto) throws Exception {
        return R.ok(modbusService.readHoldingRegisters(toTarget(dto), dto.getAddress(), dto.getQuantity()));
    }

    @Operation(summary = "读取输入寄存器 (FC04)")
    @PostMapping("/read-input-registers")
    public R<List<Integer>> readInputRegisters(@RequestBody ModbusReadDTO dto) throws Exception {
        return R.ok(modbusService.readInputRegisters(toTarget(dto), dto.getAddress(), dto.getQuantity()));
    }

    @Operation(summary = "读取线圈 (FC01)")
    @PostMapping("/read-coils")
    public R<List<Boolean>> readCoils(@RequestBody ModbusReadDTO dto) throws Exception {
        return R.ok(modbusService.readCoils(toTarget(dto), dto.getAddress(), dto.getQuantity()));
    }

    @Operation(summary = "读取离散输入 (FC02)")
    @PostMapping("/read-discrete-inputs")
    public R<List<Boolean>> readDiscreteInputs(@RequestBody ModbusReadDTO dto) throws Exception {
        return R.ok(modbusService.readDiscreteInputs(toTarget(dto), dto.getAddress(), dto.getQuantity()));
    }

    // ==================== Write Operations ====================

    @Operation(summary = "写单个寄存器 (FC06)")
    @PostMapping("/write-single-register")
    public R<Void> writeSingleRegister(@RequestBody ModbusWriteSingleRegisterDTO dto) throws Exception {
        modbusService.writeSingleRegister(toTarget(dto), dto.getAddress(), dto.getValue());
        return R.ok();
    }

    @Operation(summary = "写单个线圈 (FC05)")
    @PostMapping("/write-single-coil")
    public R<Void> writeSingleCoil(@RequestBody ModbusWriteSingleCoilDTO dto) throws Exception {
        modbusService.writeSingleCoil(toTarget(dto), dto.getAddress(), dto.isValue());
        return R.ok();
    }

    @Operation(summary = "写多个寄存器 (FC16)")
    @PostMapping("/write-multiple-registers")
    public R<Void> writeMultipleRegisters(@RequestBody ModbusWriteMultipleRegistersDTO dto) throws Exception {
        modbusService.writeMultipleRegisters(toTarget(dto), dto.getAddress(), dto.getValues());
        return R.ok();
    }

    @Operation(summary = "写多个线圈 (FC15)")
    @PostMapping("/write-multiple-coils")
    public R<Void> writeMultipleCoils(@RequestBody ModbusWriteMultipleCoilsDTO dto) throws Exception {
        modbusService.writeMultipleCoils(toTarget(dto), dto.getAddress(), dto.getValues());
        return R.ok();
    }

    // ==================== Collector Management ====================

    @Operation(summary = "注册 Modbus 采集任务")
    @PostMapping("/collectors")
    public R<Void> registerCollector(@RequestBody CollectorRegisterDTO dto) {
        ModbusCollectorTask task = new ModbusCollectorTask();
        task.setTaskId(dto.getTaskId());
        task.setTarget(toTarget(dto.getTarget()));
        task.setRegisters(dto.getRegisters());
        task.setIntervalMs(dto.getIntervalMs());
        task.setTenantId(dto.getTenantId());
        task.setProductId(dto.getProductId());
        task.setDeviceId(dto.getDeviceId());
        task.setDeviceName(dto.getDeviceName());
        collectorService.register(task);
        return R.ok();
    }

    @Operation(summary = "注销 Modbus 采集任务")
    @DeleteMapping("/collectors/{taskId}")
    public R<Void> unregisterCollector(
            @Parameter(description = "待移除采集任务编号", required = true) @PathVariable String taskId) {
        collectorService.unregister(taskId);
        return R.ok();
    }

    @Operation(summary = "查询所有采集任务")
    @GetMapping("/collectors")
    public R<Collection<ModbusCollectorTask>> listCollectors() {
        return R.ok(collectorService.listTasks());
    }

    @Operation(summary = "检查采集任务是否运行中")
    @GetMapping("/collectors/{taskId}/status")
    public R<Boolean> collectorStatus(
            @Parameter(description = "待检查采集任务编号", required = true) @PathVariable String taskId) {
        return R.ok(collectorService.isRunning(taskId));
    }

    // ==================== Helpers ====================

    private ModbusTarget toTarget(ModbusTargetDTO dto) {
        return ModbusTarget.builder()
                .host(dto.getHost())
                .port(dto.getPort() > 0 ? dto.getPort() : 502)
                .slaveId(dto.getSlaveId() > 0 ? dto.getSlaveId() : 1)
                .mode(dto.getMode() != null ? dto.getMode() : "TCP")
                .build();
    }

    // ==================== DTOs ====================

    @Data
    @Schema(description = "目标设备连接参数")
    public static class ModbusTargetDTO {
        /** Target device IP or hostname */
        @Schema(description = "目标主机地址", example = "192.168.1.100")
        private String host;

        /** Modbus TCP port (default 502) */
        @Schema(description = "通信端口", example = "502")
        private int port = 502;

        /** Slave/unit ID (1-247) */
        @Schema(description = "从站编号", example = "1")
        private int slaveId = 1;

        /** Communication mode: TCP or RTU */
        @Schema(description = "通信模式", example = "TCP")
        private String mode = "TCP";
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    @Schema(description = "寄存器读取请求")
    public static class ModbusReadDTO extends ModbusTargetDTO {
        /** Starting register address (0-based) */
        @Schema(description = "起始寄存器地址", example = "0")
        private int address;

        /** Number of registers to read */
        @Schema(description = "读取寄存器数量", example = "10")
        private int quantity = 1;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    @Schema(description = "单寄存器写入请求")
    public static class ModbusWriteSingleRegisterDTO extends ModbusTargetDTO {
        /** Target register address (0-based) */
        @Schema(description = "寄存器地址", example = "0")
        private int address;

        /** Value to write (0-65535) */
        @Schema(description = "寄存器值", example = "100")
        private int value;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    @Schema(description = "单线圈写入请求")
    public static class ModbusWriteSingleCoilDTO extends ModbusTargetDTO {
        /** Target coil address (0-based) */
        @Schema(description = "线圈地址", example = "0")
        private int address;

        /** Coil value (true=ON, false=OFF) */
        @Schema(description = "线圈值", example = "true")
        private boolean value;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    @Schema(description = "多寄存器写入请求")
    public static class ModbusWriteMultipleRegistersDTO extends ModbusTargetDTO {
        /** Starting register address (0-based) */
        @Schema(description = "起始寄存器地址", example = "0")
        private int address;

        /** List of values to write */
        @Schema(description = "待写入寄存器值列表", example = "[100, 200, 300]")
        private List<Integer> values;
    }

    @Data
    @EqualsAndHashCode(callSuper = true)
    @Schema(description = "多线圈写入请求")
    public static class ModbusWriteMultipleCoilsDTO extends ModbusTargetDTO {
        /** Starting coil address (0-based) */
        @Schema(description = "起始线圈地址", example = "0")
        private int address;

        /** List of coil values to write */
        @Schema(description = "待写入线圈值列表", example = "[true, false, true]")
        private List<Boolean> values;
    }

    @Data
    @Schema(description = "采集任务注册请求")
    public static class CollectorRegisterDTO {
        /** Unique task identifier */
        @Schema(description = "任务唯一标识", example = "modbus-task-001")
        private String taskId;

        /** Target device connection params */
        @Schema(description = "目标设备")
        private ModbusTargetDTO target;

        /** Register definitions to collect */
        @Schema(description = "周期采集寄存器列表")
        private List<ModbusRegisterDef> registers;

        /** Collection interval in milliseconds */
        @Schema(description = "采集间隔毫秒数", example = "10000")
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
        @Schema(description = "设备名称", example = "plc-01")
        private String deviceName;
    }
}
