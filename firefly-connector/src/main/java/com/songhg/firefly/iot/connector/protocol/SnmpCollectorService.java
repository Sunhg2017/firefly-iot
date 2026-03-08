package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.SnmpProperties;
import com.songhg.firefly.iot.connector.protocol.dto.SnmpCollectorTask;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.*;
import java.util.concurrent.*;

/**
 * SNMP 采集服务 — 支持动态注册/注销采集任务，周期性轮询 SNMP OID
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SnmpCollectorService {

    private final SnmpService snmpService;
    private final SnmpProperties snmpProperties;
    private final DeviceMessageProducer messageProducer;

    private ScheduledExecutorService scheduler;
    private final Map<String, ScheduledFuture<?>> runningCollectors = new ConcurrentHashMap<>();
    private final Map<String, SnmpCollectorTask> taskRegistry = new ConcurrentHashMap<>();

    @PostConstruct
    public void init() {
        if (!snmpProperties.isEnabled() || !snmpProperties.getCollector().isEnabled()) {
            log.info("SNMP collector service is disabled");
            return;
        }
        int poolSize = snmpProperties.getCollector().getPoolSize();
        scheduler = Executors.newScheduledThreadPool(poolSize, r -> {
            Thread t = new Thread(r, "snmp-collector-" + System.currentTimeMillis());
            t.setDaemon(true);
            return t;
        });
        log.info("SNMP collector service initialized with pool size {}", poolSize);
    }

    @PreDestroy
    public void destroy() {
        if (scheduler != null) {
            scheduler.shutdownNow();
        }
        runningCollectors.clear();
        taskRegistry.clear();
    }

    // ==================== Register / Unregister ====================

    public void register(SnmpCollectorTask task) {
        if (scheduler == null) {
            log.warn("SNMP collector is disabled, cannot register task: {}", task.getTaskId());
            return;
        }
        unregister(task.getTaskId());

        long intervalMs = task.getIntervalMs() > 0 ? task.getIntervalMs() : snmpProperties.getCollector().getDefaultIntervalMs();

        ScheduledFuture<?> future = scheduler.scheduleAtFixedRate(
                () -> collect(task), 0, intervalMs, TimeUnit.MILLISECONDS);

        runningCollectors.put(task.getTaskId(), future);
        taskRegistry.put(task.getTaskId(), task);
        log.info("SNMP collector registered: taskId={}, host={}, oids={}, interval={}ms",
                task.getTaskId(), task.getTarget().getHost(), task.getOids().size(), intervalMs);
    }

    public void unregister(String taskId) {
        ScheduledFuture<?> future = runningCollectors.remove(taskId);
        if (future != null) {
            future.cancel(false);
            taskRegistry.remove(taskId);
            log.info("SNMP collector unregistered: taskId={}", taskId);
        }
    }

    public boolean isRunning(String taskId) {
        return runningCollectors.containsKey(taskId);
    }

    public Collection<SnmpCollectorTask> listTasks() {
        return Collections.unmodifiableCollection(taskRegistry.values());
    }

    // ==================== Collect ====================

    private void collect(SnmpCollectorTask task) {
        try {
            Map<String, String> result = snmpService.get(task.getTarget(), task.getOids());
            if (result.isEmpty()) {
                log.debug("SNMP collect returned empty result: taskId={}", task.getTaskId());
                return;
            }

            // Map OID results to named properties using alias map
            Map<String, Object> payload = new LinkedHashMap<>();
            for (Map.Entry<String, String> entry : result.entrySet()) {
                String oid = entry.getKey();
                String value = entry.getValue();
                String alias = task.getOidAliases() != null ? task.getOidAliases().get(oid) : null;
                payload.put(alias != null ? alias : oid, parseValue(value));
            }

            DeviceMessage message = DeviceMessage.builder()
                    .tenantId(task.getTenantId())
                    .productId(task.getProductId())
                    .deviceId(task.getDeviceId())
                    .deviceName(task.getDeviceName())
                    .type(DeviceMessage.MessageType.PROPERTY_REPORT)
                    .topic("/snmp/collect/" + task.getTarget().getHost())
                    .payload(payload)
                    .timestamp(System.currentTimeMillis())
                    .build();

            messageProducer.publishUpstream(message);
            log.debug("SNMP collect completed: taskId={}, properties={}", task.getTaskId(), payload.size());
        } catch (Exception e) {
            log.error("SNMP collect failed: taskId={}, error={}", task.getTaskId(), e.getMessage());
        }
    }

    private Object parseValue(String value) {
        if (value == null) return null;
        try { return Long.parseLong(value); } catch (NumberFormatException ignored) {}
        try { return Double.parseDouble(value); } catch (NumberFormatException ignored) {}
        return value;
    }

}
