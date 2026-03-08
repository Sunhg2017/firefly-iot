package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.connector.config.SnmpProperties;
import com.songhg.firefly.iot.connector.service.DeviceMessageProducer;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.snmp4j.*;
import org.snmp4j.mp.MPv1;
import org.snmp4j.mp.MPv2c;
import org.snmp4j.security.SecurityProtocols;
import org.snmp4j.smi.*;
import org.snmp4j.transport.DefaultUdpTransportMapping;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * SNMP Trap 接收器 — 监听 SNMP Trap/Inform 并转发为 DeviceMessage
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SnmpTrapReceiver implements CommandResponder {

    private final SnmpProperties snmpProperties;
    private final DeviceMessageProducer messageProducer;

    private Snmp snmp;
    private TransportMapping<UdpAddress> transport;

    @PostConstruct
    public void init() throws IOException {
        if (!snmpProperties.isEnabled() || !snmpProperties.getTrap().isEnabled()) {
            log.info("SNMP Trap receiver is disabled");
            return;
        }

        String addr = snmpProperties.getTrap().getListenAddress() + "/" + snmpProperties.getTrap().getPort();
        transport = new DefaultUdpTransportMapping(new UdpAddress(addr));
        snmp = new Snmp(transport);
        snmp.getMessageDispatcher().addMessageProcessingModel(new MPv1());
        snmp.getMessageDispatcher().addMessageProcessingModel(new MPv2c());

        SecurityProtocols.getInstance().addDefaultProtocols();
        snmp.getUSM();

        snmp.addCommandResponder(this);
        transport.listen();

        log.info("SNMP Trap receiver started on {}", addr);
    }

    @PreDestroy
    public void destroy() throws IOException {
        if (snmp != null) {
            snmp.close();
        }
    }

    @Override
    public <A extends Address> void processPdu(CommandResponderEvent<A> event) {
        PDU pdu = event.getPDU();
        if (pdu == null) return;

        A peerAddress = event.getPeerAddress();
        String sourceIp = extractIp(peerAddress);

        log.info("SNMP Trap received from {}: type={}, vbs={}", peerAddress, pdu.getType(), pdu.size());

        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("trapType", pdu.getType() == PDU.TRAP ? "TRAPv1" : "TRAPv2c");
        payload.put("sourceIp", sourceIp);
        payload.put("peerAddress", peerAddress.toString());

        // Extract enterprise OID for v1 traps
        if (pdu instanceof PDUv1 v1Pdu) {
            payload.put("enterprise", v1Pdu.getEnterprise().toString());
            payload.put("genericTrap", v1Pdu.getGenericTrap());
            payload.put("specificTrap", v1Pdu.getSpecificTrap());
            if (v1Pdu.getAgentAddress() != null) {
                payload.put("agentAddress", v1Pdu.getAgentAddress().toString());
            }
        }

        // Extract all variable bindings
        Map<String, String> variables = new LinkedHashMap<>();
        for (VariableBinding vb : pdu.getAll()) {
            variables.put(vb.getOid().toString(), vb.getVariable().toString());
        }
        payload.put("variables", variables);

        // Build DeviceMessage — deviceId will be resolved downstream
        DeviceMessage message = DeviceMessage.builder()
                .type(DeviceMessage.MessageType.EVENT_REPORT)
                .topic("/snmp/trap/" + sourceIp)
                .payload(payload)
                .timestamp(System.currentTimeMillis())
                .build();

        messageProducer.publishUpstream(message);
        log.debug("SNMP Trap forwarded as DeviceMessage: source={}, vars={}", sourceIp, variables.size());
    }

    private String extractIp(Address address) {
        if (address == null) return "unknown";
        String str = address.toString();
        int slashIdx = str.indexOf('/');
        return slashIdx > 0 ? str.substring(0, slashIdx) : str;
    }
}
