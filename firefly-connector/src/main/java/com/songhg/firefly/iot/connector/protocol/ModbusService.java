package com.songhg.firefly.iot.connector.protocol;

import com.ghgande.j2mod.modbus.facade.ModbusTCPMaster;
import com.ghgande.j2mod.modbus.procimg.InputRegister;
import com.ghgande.j2mod.modbus.procimg.Register;
import com.ghgande.j2mod.modbus.procimg.SimpleRegister;
import com.ghgande.j2mod.modbus.util.BitVector;
import com.songhg.firefly.iot.connector.protocol.dto.AutoCloseableMaster;
import com.songhg.firefly.iot.connector.protocol.dto.ModbusTarget;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.List;

/**
 * Modbus 操作服务 — 封装 j2mod 的 Modbus TCP 读写操作
 */
@Slf4j
@Service
public class ModbusService {

    private static final int CONNECT_TIMEOUT_MS = 5000;

    // ==================== Test Connection ====================

    public boolean testConnection(ModbusTarget target) {
        try (AutoCloseableMaster master = connect(target)) {
            // Try reading holding register 0 to verify connection
            master.getMaster().readMultipleRegisters(target.getSlaveId(), 0, 1);
            return true;
        } catch (Exception e) {
            log.debug("Modbus connection test failed: {} — {}", target.getHost(), e.getMessage());
            return false;
        }
    }

    // ==================== Read Holding Registers (FC03) ====================

    public List<Integer> readHoldingRegisters(ModbusTarget target, int address, int quantity) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            Register[] regs = master.getMaster().readMultipleRegisters(target.getSlaveId(), address, quantity);
            List<Integer> result = new ArrayList<>(regs.length);
            for (Register r : regs) {
                result.add(r.getValue());
            }
            return result;
        }
    }

    // ==================== Read Input Registers (FC04) ====================

    public List<Integer> readInputRegisters(ModbusTarget target, int address, int quantity) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            InputRegister[] regs = master.getMaster().readInputRegisters(target.getSlaveId(), address, quantity);
            List<Integer> result = new ArrayList<>(regs.length);
            for (InputRegister r : regs) {
                result.add(r.getValue());
            }
            return result;
        }
    }

    // ==================== Read Coils (FC01) ====================

    public List<Boolean> readCoils(ModbusTarget target, int address, int quantity) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            BitVector bv = master.getMaster().readCoils(target.getSlaveId(), address, quantity);
            List<Boolean> result = new ArrayList<>(quantity);
            for (int i = 0; i < quantity; i++) {
                result.add(bv.getBit(i));
            }
            return result;
        }
    }

    // ==================== Read Discrete Inputs (FC02) ====================

    public List<Boolean> readDiscreteInputs(ModbusTarget target, int address, int quantity) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            BitVector bv = master.getMaster().readInputDiscretes(target.getSlaveId(), address, quantity);
            List<Boolean> result = new ArrayList<>(quantity);
            for (int i = 0; i < quantity; i++) {
                result.add(bv.getBit(i));
            }
            return result;
        }
    }

    // ==================== Write Single Register (FC06) ====================

    public void writeSingleRegister(ModbusTarget target, int address, int value) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            master.getMaster().writeSingleRegister(target.getSlaveId(), address, new SimpleRegister(value));
        }
    }

    // ==================== Write Single Coil (FC05) ====================

    public void writeSingleCoil(ModbusTarget target, int address, boolean value) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            master.getMaster().writeCoil(target.getSlaveId(), address, value);
        }
    }

    // ==================== Write Multiple Registers (FC16) ====================

    public void writeMultipleRegisters(ModbusTarget target, int address, List<Integer> values) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            Register[] regs = new Register[values.size()];
            for (int i = 0; i < values.size(); i++) {
                regs[i] = new SimpleRegister(values.get(i));
            }
            master.getMaster().writeMultipleRegisters(target.getSlaveId(), address, regs);
        }
    }

    // ==================== Write Multiple Coils (FC15) ====================

    public void writeMultipleCoils(ModbusTarget target, int address, List<Boolean> values) throws Exception {
        try (AutoCloseableMaster master = connect(target)) {
            BitVector bv = new BitVector(values.size());
            for (int i = 0; i < values.size(); i++) {
                bv.setBit(i, values.get(i));
            }
            master.getMaster().writeMultipleCoils(target.getSlaveId(), address, bv);
        }
    }

    // ==================== Helpers ====================

    private AutoCloseableMaster connect(ModbusTarget target) throws Exception {
        ModbusTCPMaster master = new ModbusTCPMaster(target.getHost(), target.getPort());
        master.setTimeout(CONNECT_TIMEOUT_MS);
        master.setRetries(1);
        master.connect();
        return new AutoCloseableMaster(master);
    }

}
