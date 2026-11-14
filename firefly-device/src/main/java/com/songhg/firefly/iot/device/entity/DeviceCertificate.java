package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.CertificateStatus;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

/**
 * 设备 X.509 证书绑定。
 */
@Data
@EqualsAndHashCode(callSuper = true)
@TableName("device_certificate")
public class DeviceCertificate extends TenantEntity {

    private Long deviceId;
    private String serialNumber;
    private String subjectDn;
    private String fingerprintSha256;
    private String certificatePem;
    private CertificateStatus status;
    private LocalDateTime validFrom;
    private LocalDateTime validTo;
    private Long createdBy;
}
