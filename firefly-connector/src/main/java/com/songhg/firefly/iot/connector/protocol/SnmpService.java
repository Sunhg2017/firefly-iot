package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.connector.config.SnmpProperties;
import com.songhg.firefly.iot.connector.protocol.dto.SnmpTarget;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.snmp4j.*;
import org.snmp4j.event.ResponseEvent;
import org.snmp4j.mp.MPv3;
import org.snmp4j.mp.SnmpConstants;
import org.snmp4j.security.*;
import org.snmp4j.smi.*;
import org.snmp4j.transport.DefaultUdpTransportMapping;
import org.snmp4j.util.DefaultPDUFactory;
import org.snmp4j.util.TreeEvent;
import org.snmp4j.util.TreeUtils;
import org.springframework.stereotype.Service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.io.IOException;
import java.util.*;

/**
 * 核心 SNMP 操作服务 — 封装 SNMP4J 的 GET / WALK / SET 操作
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class SnmpService {

    private final SnmpProperties snmpProperties;

    private Snmp snmp;
    private TransportMapping<UdpAddress> transport;

    @PostConstruct
    public void init() throws IOException {
        if (!snmpProperties.isEnabled()) {
            log.info("SNMP service is disabled");
            return;
        }
        transport = new DefaultUdpTransportMapping();
        snmp = new Snmp(transport);

        // SNMPv3 USM support
        USM usm = new USM(SecurityProtocols.getInstance(), new OctetString(MPv3.createLocalEngineID()), 0);
        SecurityModels.getInstance().addSecurityModel(usm);

        transport.listen();
        log.info("SNMP service initialized");
    }

    @PreDestroy
    public void destroy() throws IOException {
        if (snmp != null) {
            snmp.close();
        }
    }

    // ==================== SNMP GET ====================

    public Map<String, String> get(SnmpTarget target, List<String> oids) throws IOException {
        Target<Address> ct = buildTarget(target);
        PDU pdu = createPDU(target.getVersion());
        for (String oid : oids) {
            pdu.add(new VariableBinding(new OID(oid)));
        }
        pdu.setType(PDU.GET);

        ResponseEvent<Address> event = snmp.send(pdu, ct);
        return processResponse(event);
    }

    // ==================== SNMP GET-NEXT ====================

    public Map<String, String> getNext(SnmpTarget target, List<String> oids) throws IOException {
        Target<Address> ct = buildTarget(target);
        PDU pdu = createPDU(target.getVersion());
        for (String oid : oids) {
            pdu.add(new VariableBinding(new OID(oid)));
        }
        pdu.setType(PDU.GETNEXT);

        ResponseEvent<Address> event = snmp.send(pdu, ct);
        return processResponse(event);
    }

    // ==================== SNMP WALK ====================

    public Map<String, String> walk(SnmpTarget target, String rootOid) {
        Target<Address> ct = buildTarget(target);
        Map<String, String> result = new LinkedHashMap<>();

        TreeUtils treeUtils = new TreeUtils(snmp, new DefaultPDUFactory());
        List<TreeEvent> events = treeUtils.getSubtree(ct, new OID(rootOid));

        for (TreeEvent event : events) {
            if (event == null || event.isError()) {
                log.warn("SNMP walk error at {}: {}", rootOid,
                        event != null ? event.getErrorMessage() : "null event");
                continue;
            }
            VariableBinding[] vbs = event.getVariableBindings();
            if (vbs != null) {
                for (VariableBinding vb : vbs) {
                    result.put(vb.getOid().toString(), vb.getVariable().toString());
                }
            }
        }
        return result;
    }

    // ==================== SNMP SET ====================

    public boolean set(SnmpTarget target, String oid, String value, int smiSyntax) throws IOException {
        Target<Address> ct = buildTarget(target);
        PDU pdu = createPDU(target.getVersion());

        Variable var = createVariable(value, smiSyntax);
        pdu.add(new VariableBinding(new OID(oid), var));
        pdu.setType(PDU.SET);

        ResponseEvent<Address> event = snmp.send(pdu, ct);
        if (event != null && event.getResponse() != null) {
            return event.getResponse().getErrorStatus() == PDU.noError;
        }
        return false;
    }

    // ==================== Test Connection ====================

    public boolean testConnection(SnmpTarget target) {
        try {
            // sysDescr.0
            Map<String, String> result = get(target, List.of("1.3.6.1.2.1.1.1.0"));
            return !result.isEmpty();
        } catch (Exception e) {
            log.debug("SNMP connection test failed: {}", e.getMessage());
            return false;
        }
    }

    // ==================== Get System Info ====================

    public Map<String, String> getSystemInfo(SnmpTarget target) throws IOException {
        List<String> sysOids = List.of(
                "1.3.6.1.2.1.1.1.0",  // sysDescr
                "1.3.6.1.2.1.1.2.0",  // sysObjectID
                "1.3.6.1.2.1.1.3.0",  // sysUpTime
                "1.3.6.1.2.1.1.4.0",  // sysContact
                "1.3.6.1.2.1.1.5.0",  // sysName
                "1.3.6.1.2.1.1.6.0",  // sysLocation
                "1.3.6.1.2.1.1.7.0"   // sysServices
        );
        Map<String, String> raw = get(target, sysOids);
        Map<String, String> named = new LinkedHashMap<>();
        String[] labels = {"sysDescr", "sysObjectID", "sysUpTime", "sysContact", "sysName", "sysLocation", "sysServices"};
        for (int i = 0; i < sysOids.size(); i++) {
            String val = raw.get(sysOids.get(i));
            if (val != null) named.put(labels[i], val);
        }
        return named;
    }

    // ==================== Helpers ====================

    private Target<Address> buildTarget(SnmpTarget target) {
        Address address = GenericAddress.parse("udp:" + target.getHost() + "/" + target.getPort());
        int version = switch (target.getVersion()) {
            case 1 -> SnmpConstants.version1;
            case 3 -> SnmpConstants.version3;
            default -> SnmpConstants.version2c;
        };

        if (version == SnmpConstants.version3) {
            return buildV3Target(target, address);
        }

        CommunityTarget<Address> ct = new CommunityTarget<>();
        ct.setCommunity(new OctetString(target.getCommunity() != null ? target.getCommunity() : "public"));
        ct.setAddress(address);
        ct.setRetries(snmpProperties.getRetries());
        ct.setTimeout(snmpProperties.getTimeoutMs());
        ct.setVersion(version);
        return ct;
    }

    /**
     * SNMPv3 使用 USM 用户 + UserTarget。认证/加密协议缺省为 SHA / AES128，
     * 安全级别可根据填写的口令推断，也可由调用方显式指定。
     */
    private UserTarget<Address> buildV3Target(SnmpTarget target, Address address) {
        if (snmp == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "SNMP 服务未启用");
        }
        String securityName = trimToNull(target.getSecurityName());
        if (securityName == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "SNMPv3 必须填写安全名称（securityName）");
        }

        OctetString authPassphrase = toPassphrase(target.getAuthPassphrase(), "认证口令");
        OctetString privPassphrase = toPassphrase(target.getPrivPassphrase(), "加密口令");
        int securityLevel = resolveSecurityLevel(target.getSecurityLevel(), authPassphrase, privPassphrase);

        if (securityLevel != SecurityLevel.NOAUTH_NOPRIV && authPassphrase == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "当前安全级别需要填写认证口令");
        }
        if (securityLevel == SecurityLevel.AUTH_PRIV && privPassphrase == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "AUTH_PRIV 安全级别需要填写加密口令");
        }

        OID authProtocol = resolveAuthProtocol(target.getAuthProtocol());
        OID privProtocol = resolvePrivProtocol(target.getPrivProtocol());

        UserTarget<Address> userTarget = new UserTarget<>();
        userTarget.setAddress(address);
        userTarget.setVersion(SnmpConstants.version3);
        userTarget.setRetries(snmpProperties.getRetries());
        userTarget.setTimeout(snmpProperties.getTimeoutMs());
        userTarget.setSecurityName(new OctetString(securityName));
        userTarget.setSecurityLevel(securityLevel);

        UsmUser user = new UsmUser(
                new OctetString(securityName),
                authPassphrase == null ? null : authProtocol,
                authPassphrase,
                privPassphrase == null ? null : privProtocol,
                privPassphrase
        );
        snmp.getUSM().addUser(new OctetString(securityName), user);
        return userTarget;
    }

    private OctetString toPassphrase(String raw, String label) {
        String value = trimToNull(raw);
        if (value == null) {
            return null;
        }
        if (value.length() < 8) {
            throw new BizException(ResultCode.PARAM_ERROR, label + "至少 8 位");
        }
        return new OctetString(value);
    }

    static int resolveSecurityLevel(String rawLevel, OctetString authPassphrase, OctetString privPassphrase) {
        String level = trimToNull(rawLevel);
        if (level != null) {
            return switch (level.toUpperCase(Locale.ROOT)) {
                case "NOAUTH_NOPRIV", "NOAUTHNOPRIV" -> SecurityLevel.NOAUTH_NOPRIV;
                case "AUTH_NOPRIV", "AUTHNOPRIV" -> SecurityLevel.AUTH_NOPRIV;
                case "AUTH_PRIV", "AUTHPRIV" -> SecurityLevel.AUTH_PRIV;
                default -> throw new BizException(ResultCode.PARAM_ERROR,
                        "securityLevel 仅支持 NOAUTH_NOPRIV / AUTH_NOPRIV / AUTH_PRIV");
            };
        }
        if (authPassphrase == null) {
            return SecurityLevel.NOAUTH_NOPRIV;
        }
        return privPassphrase == null ? SecurityLevel.AUTH_NOPRIV : SecurityLevel.AUTH_PRIV;
    }

    static OID resolveAuthProtocol(String rawProtocol) {
        String protocol = trimToNull(rawProtocol);
        if (protocol == null) {
            return AuthSHA.ID;
        }
        return switch (protocol.toUpperCase(Locale.ROOT)) {
            case "MD5" -> AuthMD5.ID;
            case "SHA", "SHA1" -> AuthSHA.ID;
            case "SHA224" -> AuthHMAC128SHA224.ID;
            case "SHA256" -> AuthHMAC192SHA256.ID;
            case "SHA384" -> AuthHMAC256SHA384.ID;
            case "SHA512" -> AuthHMAC384SHA512.ID;
            default -> throw new BizException(ResultCode.PARAM_ERROR,
                    "authProtocol 仅支持 MD5 / SHA / SHA224 / SHA256 / SHA384 / SHA512");
        };
    }

    static OID resolvePrivProtocol(String rawProtocol) {
        String protocol = trimToNull(rawProtocol);
        if (protocol == null) {
            return PrivAES128.ID;
        }
        return switch (protocol.toUpperCase(Locale.ROOT)) {
            case "DES" -> PrivDES.ID;
            case "AES", "AES128" -> PrivAES128.ID;
            case "AES192" -> PrivAES192.ID;
            case "AES256" -> PrivAES256.ID;
            case "3DES" -> Priv3DES.ID;
            default -> throw new BizException(ResultCode.PARAM_ERROR,
                    "privProtocol 仅支持 DES / AES128 / AES192 / AES256 / 3DES");
        };
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private PDU createPDU(int version) {
        if (version == 3) {
            return new ScopedPDU();
        }
        return new PDU();
    }

    private Map<String, String> processResponse(ResponseEvent<Address> event) {
        Map<String, String> result = new LinkedHashMap<>();
        if (event == null || event.getResponse() == null) {
            log.debug("SNMP request timed out or no response");
            return result;
        }
        PDU response = event.getResponse();
        if (response.getErrorStatus() != PDU.noError) {
            log.warn("SNMP error: status={}, index={}, text={}",
                    response.getErrorStatus(), response.getErrorIndex(), response.getErrorStatusText());
            return result;
        }
        for (VariableBinding vb : response.getAll()) {
            if (vb.getVariable().getSyntax() != SMIConstants.EXCEPTION_NO_SUCH_OBJECT
                    && vb.getVariable().getSyntax() != SMIConstants.EXCEPTION_NO_SUCH_INSTANCE
                    && vb.getVariable().getSyntax() != SMIConstants.EXCEPTION_END_OF_MIB_VIEW) {
                result.put(vb.getOid().toString(), vb.getVariable().toString());
            }
        }
        return result;
    }

    private Variable createVariable(String value, int smiSyntax) {
        return switch (smiSyntax) {
            case SMIConstants.SYNTAX_INTEGER32 -> new Integer32(Integer.parseInt(value));
            case SMIConstants.SYNTAX_COUNTER32 -> new Counter32(Long.parseLong(value));
            case SMIConstants.SYNTAX_COUNTER64 -> new Counter64(Long.parseLong(value));
            case SMIConstants.SYNTAX_GAUGE32 -> new Gauge32(Long.parseLong(value));
            case SMIConstants.SYNTAX_TIMETICKS -> new TimeTicks(Long.parseLong(value));
            case SMIConstants.SYNTAX_IPADDRESS -> new IpAddress(value);
            default -> new OctetString(value);
        };
    }

}
