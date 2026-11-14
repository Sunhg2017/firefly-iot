package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.connector.config.ModbusProperties;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusCollectorStatus;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;

class ModbusCollectorStatusTest {

    private final ModbusCollectorService service = new ModbusCollectorService(
            mock(ModbusService.class),
            new ModbusProperties(),
            mock(DeviceMessageProducer.class)
    );

    @Test
    void unknownTaskShouldReportNotRunningWithoutTimestamps() {
        ModbusCollectorStatus status = service.getStatus("missing-task");

        assertFalse(status.isRunning());
        assertNull(status.getLastCollectAt());
        assertNull(status.getLastError());
        assertTrue(service.getStatuses().isEmpty());
    }
}
