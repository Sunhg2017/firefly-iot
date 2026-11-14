package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.CertificateStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.certificate.DeviceCertificateCreateDTO;
import com.songhg.firefly.iot.device.dto.certificate.DeviceCertificateVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.DeviceCertificate;
import com.songhg.firefly.iot.device.mapper.DeviceCertificateMapper;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.io.ByteArrayInputStream;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.cert.CertificateFactory;
import java.security.cert.X509Certificate;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.HexFormat;
import java.util.List;

/**
 * 设备 X.509 证书管理：登记、列表、吊销、指纹校验。
 * 认证阶段只信任「启用且未过期」的证书指纹。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceCertificateService {

    private final DeviceCertificateMapper certificateMapper;
    private final DeviceMapper deviceMapper;

    @Transactional
    public DeviceCertificateVO register(Long deviceId, DeviceCertificateCreateDTO dto) {
        Device device = requireDevice(deviceId);
        X509Certificate certificate = parseCertificate(dto.getCertificatePem());
        String fingerprint = sha256Hex(certificate);

        DeviceCertificate existing = certificateMapper.selectOne(new LambdaQueryWrapper<DeviceCertificate>()
                .eq(DeviceCertificate::getFingerprintSha256, fingerprint));
        if (existing != null) {
            throw new BizException(ResultCode.CONFLICT, "该证书指纹已登记");
        }

        DeviceCertificate entity = new DeviceCertificate();
        entity.setTenantId(device.getTenantId());
        entity.setDeviceId(device.getId());
        entity.setSerialNumber(certificate.getSerialNumber().toString(16));
        entity.setSubjectDn(certificate.getSubjectX500Principal().getName());
        entity.setFingerprintSha256(fingerprint);
        entity.setCertificatePem(dto.getCertificatePem().trim());
        entity.setStatus(CertificateStatus.ACTIVE);
        entity.setValidFrom(toLocalDateTime(certificate.getNotBefore()));
        entity.setValidTo(toLocalDateTime(certificate.getNotAfter()));
        entity.setCreatedBy(AppContextHolder.getUserId());
        certificateMapper.insert(entity);
        log.info("Device certificate registered: deviceId={}, fingerprint={}", deviceId, fingerprint);
        return toVO(entity);
    }

    public List<DeviceCertificateVO> list(Long deviceId) {
        Long tenantId = AppContextHolder.getTenantId();
        List<DeviceCertificate> certificates = certificateMapper.selectList(
                new LambdaQueryWrapper<DeviceCertificate>()
                        .eq(DeviceCertificate::getTenantId, tenantId)
                        .eq(DeviceCertificate::getDeviceId, deviceId)
                        .orderByDesc(DeviceCertificate::getCreatedAt));
        return certificates.stream().map(this::toVO).toList();
    }

    @Transactional
    public void revoke(Long certificateId) {
        DeviceCertificate certificate = requireCertificate(certificateId);
        certificate.setStatus(CertificateStatus.REVOKED);
        certificateMapper.updateById(certificate);
        log.info("Device certificate revoked: id={}, deviceId={}", certificateId, certificate.getDeviceId());
    }

    @Transactional
    public void delete(Long certificateId) {
        DeviceCertificate certificate = requireCertificate(certificateId);
        certificateMapper.deleteById(certificate.getId());
        log.info("Device certificate deleted: id={}, deviceId={}", certificateId, certificate.getDeviceId());
    }

    /**
     * 认证阶段调用：设备侧没有请求级租户上下文，显式使用设备自身的租户。
     */
    public boolean isFingerprintActive(Device device, String fingerprint) {
        if (device == null || !StringUtils.hasText(fingerprint)) {
            return false;
        }
        DeviceCertificate certificate = certificateMapper.selectActiveByFingerprint(
                device.getTenantId(), device.getId(), fingerprint.trim().toLowerCase());
        return certificate != null;
    }

    public String createFingerprint(String certificatePem) {
        return sha256Hex(parseCertificate(certificatePem));
    }

    private Device requireDevice(Long deviceId) {
        Long tenantId = AppContextHolder.getTenantId();
        Device device = deviceMapper.selectOne(new LambdaQueryWrapper<Device>()
                .eq(Device::getId, deviceId)
                .eq(Device::getTenantId, tenantId)
                .isNull(Device::getDeletedAt));
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private DeviceCertificate requireCertificate(Long certificateId) {
        Long tenantId = AppContextHolder.getTenantId();
        DeviceCertificate certificate = certificateMapper.selectOne(new LambdaQueryWrapper<DeviceCertificate>()
                .eq(DeviceCertificate::getId, certificateId)
                .eq(DeviceCertificate::getTenantId, tenantId));
        if (certificate == null) {
            throw new BizException(ResultCode.NOT_FOUND, "设备证书不存在");
        }
        return certificate;
    }

    private X509Certificate parseCertificate(String pem) {
        try {
            CertificateFactory factory = CertificateFactory.getInstance("X.509");
            return (X509Certificate) factory.generateCertificate(
                    new ByteArrayInputStream(pem.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "证书内容不是合法的 X.509 PEM: " + ex.getMessage());
        }
    }

    private String sha256Hex(X509Certificate certificate) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(digest.digest(certificate.getEncoded()));
        } catch (Exception ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "计算证书指纹失败");
        }
    }

    private LocalDateTime toLocalDateTime(java.util.Date date) {
        if (date == null) {
            return null;
        }
        return LocalDateTime.ofInstant(Instant.ofEpochMilli(date.getTime()), ZoneId.systemDefault());
    }

    private DeviceCertificateVO toVO(DeviceCertificate certificate) {
        DeviceCertificateVO vo = new DeviceCertificateVO();
        vo.setId(certificate.getId());
        vo.setDeviceId(certificate.getDeviceId());
        vo.setSerialNumber(certificate.getSerialNumber());
        vo.setSubjectDn(certificate.getSubjectDn());
        vo.setFingerprintSha256(certificate.getFingerprintSha256());
        vo.setStatus(certificate.getStatus());
        vo.setValidFrom(certificate.getValidFrom());
        vo.setValidTo(certificate.getValidTo());
        vo.setCreatedAt(certificate.getCreatedAt());
        return vo;
    }
}
