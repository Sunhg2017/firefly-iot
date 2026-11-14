package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.ModbusProperties;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusCollectorStatus;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusCollectorTask;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusRegisterDef;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.concurrent.*;

/**
 * Modbus 采集服务 — 支持动态注册/注销采集任务，周期性轮询 Modbus 寄存器
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class ModbusCollectorService {

    private final ModbusService modbusService;
    private final ModbusProperties modbusProperties;
    private final DeviceMessageProducer messageProducer;

    private ScheduledExecutorService scheduler;
    private final Map<String, ScheduledFuture<?>> runningCollectors = new ConcurrentHashMap<>();
    private final Map<String, ModbusCollectorTask> taskRegistry = new ConcurrentHashMap<>();
    private final Map<String, ModbusCollectorStatus> statusRegistry = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        if (!modbusProperties.isEnabled() || !modbusProperties.getCollector().isEnabled()) {
            log.info("Modbus collector service is disabled");
            return;
        }
        int poolSize = modbusProperties.getCollector().getPoolSize();
        scheduler = Executors.newScheduledThreadPool(poolSize, r -> {
            Thread t = new Thread(r, "modbus-collector-" + System.currentTimeMillis());
            t.setDaemon(true);
            return t;
        });
        log.info("Modbus collector service initialized with pool size {}", poolSize);
    }

    @PreDestroy
    public void destroy() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        runningCollectors.clear();
        taskRegistry.clear();
        statusRegistry.clear();
    }

    // ==================== Register / Unregister ====================

    public void register(ModbusCollectorTask task) {
        if (scheduler == null) {
            log.warn("Modbus collector is disabled, cannot register task: {}", task.getTaskId());
            return;
        }
        unregister(task.getTaskId());

        long intervalMs = task.getIntervalMs() > 0 ? task.getIntervalMs() : modbusProperties.getCollector().getDefaultIntervalMs();

        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                () -> collect(task), 0, intervalMs, TimeUnit.MILLISECONDS);

        runningCollectors.put(task.getTaskId(), future);
        taskRegistry.put(task.getTaskId(), task);
        statusRegistry.put(task.getTaskId(), ModbusCollectorStatus.builder().running(true).build());
        log.info("Modbus collector registered: taskId={}, host={}:{}, slaveId={}, registers={}, interval={}ms",
                task.getTaskId(), task.getTarget().getHost(), task.getTarget().getPort(),
                task.getTarget().getSlaveId(), task.getRegisters().size(), intervalMs);
    }

    public void unregister(String taskId) {
        ScheduledFuture<?> future = runningCollectors.remove(taskId);
        if (future != null) {
            future.cancel(false);
            taskRegistry.remove(taskId);
            statusRegistry.remove(taskId);
            log.info("Modbus collector unregistered: taskId={}", taskId);
        }
    }

    public boolean isRunning(String taskId) {
        return runningCollectors.containsKey(taskId);
    }

    /**
     * 返回任务运行状态；未注册的任务返回 running=false，便于前端区分“任务不存在”和“任务已停止”。
     */
    public ModbusCollectorStatus getStatus(String taskId) {
        ModbusCollectorStatus status = statusRegistry.get(taskId);
        if (status == null) {
            return ModbusCollectorStatus.builder().running(false).build();
        }
        status.setRunning(runningCollectors.containsKey(taskId));
        return status;
    }

    public Map<String, ModbusCollectorStatus> getStatuses() {
        Map<String, ModbusCollectorStatus> result = new LinkedHashMap<>();
        taskRegistry.keySet().forEach(taskId -> result.put(taskId, getStatus(taskId)));
        return result;
    }

    public Collection<ModbusCollectorTask> listTasks() {
        return Collections.unmodifiableCollection(taskRegistry.values());
    }

    // ==================== Collect ====================

    private void collect(ModbusCollectorTask task) {
        ModbusCollectorStatus status = statusRegistry.computeIfAbsent(
                task.getTaskId(),
                key -> ModbusCollectorStatus.builder().running(true).build()
        );
        status.setLastAttemptAt(LocalDateTime.now());
        try {
            Map<String, Object> payload = new LinkedHashMap<>();

            for (ModbusRegisterDef reg : task.getRegisters()) {
                try {
                    List<Integer> values;
                    switch (reg.getFunctionCode()) {
                        case 3:
                            values = modbusService.readHoldingRegisters(task.getTarget(), reg.getAddress(), reg.getQuantity());
                            break;
                        case 4:
                            values = modbusService.readInputRegisters(task.getTarget(), reg.getAddress(), reg.getQuantity());
                            break;
                        default:
                            log.warn("Unsupported function code for collector: FC{}", reg.getFunctionCode());
                            continue;
                    }
                    if (reg.getQuantity() == 1) {
                        payload.put(reg.getAlias(), values.get(0));
                    } else {
                        payload.put(reg.getAlias(), values);
                    }
                } catch (Exception e) {
                    log.debug("Failed to read register {} (FC{}): {}", reg.getAlias(), reg.getFunctionCode(), e.getMessage());
                }
            }

            if (payload.isEmpty()) {
                status.setConsecutiveFailures(status.getConsecutiveFailures() + 1);
                status.setLastError("本次采集未读取到任何寄存器数据");
                log.debug("Modbus collect returned empty result: taskId={}", task.getTaskId());
                return;
            }

            DeviceMessage message = DeviceMessage.builder()
                    .tenantId(task.getTenantId())
                    .productId(task.getProductId())
                    .deviceId(task.getDeviceId())
                    .deviceName(task.getDeviceName())
                    .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                    .topic("/modbus/collect/" + task.getTarget().getHost())
                    .payload(payload)
                    .timestamp(System.currentTimeMillis())
                    .build();

            messageProducer.publishUpstream(message);
            status.setLastCollectAt(LocalDateTime.now());
            status.setLastError(null);
            status.setConsecutiveFailures(0);
            log.debug("Modbus collect completed: taskId={}, properties={}", task.getTaskId(), payload.size());
        } catch (Exception e) {
            status.setConsecutiveFailures(status.getConsecutiveFailures() + 1);
            status.setLastError(e.getMessage());
            log.error("Modbus collect failed: taskId={}, error={}", task.getTaskId(), e.getMessage());
        }
    }

}
