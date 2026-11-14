package com.songhg.firefly.iot.device.service;

import com.songhg.firefly.iot.common.enums.FirmwareStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.device.config.OtaProperties;
import com.songhg.firefly.iot.device.entity.Firmware;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.FirmwareMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskDeviceMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskMapper;
import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.MessageDigest;
import java.security.Signature;
import java.util.Base64;
import java.util.HexFormat;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class OtaServiceTest {

    private final FirmwareMapper firmwareMapper = mock(FirmwareMapper.class);
    private final OtaTaskMapper otaTaskMapper = mock(OtaTaskMapper.class);
    private final OtaTaskDeviceMapper otaTaskDeviceMapper = mock(OtaTaskDeviceMapper.class);
    private final DeviceMapper deviceMapper = mock(DeviceMapper.class);
    private final DeviceMessageProducer messageProducer = mock(DeviceMessageProducer.class);
    private final OtaProperties otaProperties = new OtaProperties();
    private final OtaService service = new OtaService(
            firmwareMapper, otaTaskMapper, otaTaskDeviceMapper, deviceMapper, messageProducer, otaProperties);

    @Test
    void verifyFirmwareAcceptsValidSignature() throws Exception {
        KeyPair keyPair = rsaKeyPair();
        byte[] fileBytes = "firmware-binary".getBytes(StandardCharsets.UTF_8);
        byte[] digest = MessageDigest.getInstance("SHA-256").digest(fileBytes);
        String sha256 = HexFormat.of().formatHex(digest);

        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(keyPair.getPrivate());
        signer.update(digest);
        String signature = Base64.getEncoder().encodeToString(signer.sign());

        otaProperties.setSignaturePublicKey(publicKeyPem(keyPair));
        Firmware firmware = draftFirmware();
        firmware.setSha256Checksum(sha256);
        firmware.setSignature(signature);
        when(firmwareMapper.selectById(1L)).thenReturn(firmware);

        service.verifyFirmware(1L);

        assertEquals(FirmwareStatus.VERIFIED, firmware.getStatus());
        verify(firmwareMapper).updateById(firmware);
    }

    @Test
    void verifyFirmwareRejectsTamperedSignature() throws Exception {
        KeyPair keyPair = rsaKeyPair();
        byte[] digest = MessageDigest.getInstance("SHA-256").digest("firmware-binary".getBytes(StandardCharsets.UTF_8));
        String sha256 = HexFormat.of().formatHex(digest);

        otaProperties.setSignaturePublicKey(publicKeyPem(keyPair));
        Firmware firmware = draftFirmware();
        firmware.setSha256Checksum(sha256);
        firmware.setSignature(Base64.getEncoder().encodeToString("not-a-real-signature".getBytes(StandardCharsets.UTF_8)));
        when(firmwareMapper.selectById(1L)).thenReturn(firmware);

        assertThrows(BizException.class, () -> service.verifyFirmware(1L));
        assertEquals(FirmwareStatus.DRAFT, firmware.getStatus());
    }

    @Test
    void verifyFirmwareRejectsSignatureWithoutPublicKey() throws Exception {
        Firmware firmware = draftFirmware();
        firmware.setSha256Checksum("a".repeat(64));
        firmware.setSignature("c2lnbmF0dXJl");
        when(firmwareMapper.selectById(1L)).thenReturn(firmware);

        assertThrows(BizException.class, () -> service.verifyFirmware(1L));
    }

    @Test
    void verifyFirmwareRejectsMissingChecksum() {
        Firmware firmware = draftFirmware();
        when(firmwareMapper.selectById(1L)).thenReturn(firmware);

        assertThrows(BizException.class, () -> service.verifyFirmware(1L));
    }

    private Firmware draftFirmware() {
        Firmware firmware = new Firmware();
        firmware.setId(1L);
        firmware.setTenantId(1L);
        firmware.setProductId(2L);
        firmware.setVersion("1.0.0");
        firmware.setStatus(FirmwareStatus.DRAFT);
        return firmware;
    }

    private KeyPair rsaKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private String publicKeyPem(KeyPair keyPair) {
        String base64 = Base64.getMimeEncoder().encodeToString(keyPair.getPublic().getEncoded());
        return "-----BEGIN PUBLIC KEY-----\n" + base64 + "\n-----END PUBLIC KEY-----";
    }
}
