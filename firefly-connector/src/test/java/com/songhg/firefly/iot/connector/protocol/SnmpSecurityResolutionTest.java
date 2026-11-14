package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.common.exception.BizException;
import org.junit.jupiter.api.Test;
import org.snmp4j.security.AuthHMAC192SHA256;
import org.snmp4j.security.AuthMD5;
import org.snmp4j.security.AuthSHA;
import org.snmp4j.security.PrivAES128;
import org.snmp4j.security.PrivDES;
import org.snmp4j.security.SecurityLevel;
import org.snmp4j.smi.OctetString;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class SnmpSecurityResolutionTest {

    @Test
    void shouldResolveAuthProtocolWithDefaultAndAliases() {
        assertEquals(AuthSHA.ID, SnmpService.resolveAuthProtocol(null));
        assertEquals(AuthSHA.ID, SnmpService.resolveAuthProtocol("SHA1"));
        assertEquals(AuthMD5.ID, SnmpService.resolveAuthProtocol("md5"));
        assertEquals(AuthHMAC192SHA256.ID, SnmpService.resolveAuthProtocol("SHA256"));
        assertThrows(BizException.class, () -> SnmpService.resolveAuthProtocol("UNKNOWN"));
    }

    @Test
    void shouldResolvePrivProtocolWithDefaultAndAliases() {
        assertEquals(PrivAES128.ID, SnmpService.resolvePrivProtocol(null));
        assertEquals(PrivAES128.ID, SnmpService.resolvePrivProtocol("AES"));
        assertEquals(PrivDES.ID, SnmpService.resolvePrivProtocol("DES"));
        assertThrows(BizException.class, () -> SnmpService.resolvePrivProtocol("UNKNOWN"));
    }

    @Test
    void shouldResolveSecurityLevelExplicitlyOrByPassphrase() {
        OctetString auth = new OctetString("12345678");
        OctetString priv = new OctetString("12345678");

        assertEquals(SecurityLevel.NOAUTH_NOPRIV, SnmpService.resolveSecurityLevel(null, null, null));
        assertEquals(SecurityLevel.AUTH_NOPRIV, SnmpService.resolveSecurityLevel(null, auth, null));
        assertEquals(SecurityLevel.AUTH_PRIV, SnmpService.resolveSecurityLevel(null, auth, priv));
        assertEquals(SecurityLevel.AUTH_NOPRIV, SnmpService.resolveSecurityLevel("auth_nopriv", auth, priv));
        assertThrows(BizException.class, () -> SnmpService.resolveSecurityLevel("INVALID", auth, priv));
    }
}
