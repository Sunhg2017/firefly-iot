package com.songhg.firefly.iot.connector.protocol.dto;

import com.ghgande.j2mod.modbus.facade.ModbusTCPMaster;

/**
 * AutoCloseable wrapper for ModbusTCPMaster to enable try-with-resources
 */
public class AutoCloseableMaster implements AutoCloseable {
    private final ModbusTCPMaster master;

    public AutoCloseableMaster(ModbusTCPMaster master) {
        this.master = master;
    }

    public ModbusTCPMaster getMaster() {
        return master;
    }

    @Override
    public void close() {
        try {
            master.disconnect();
        } catch (Exception e) {
            // ignore disconnect errors
        }
    }
}
