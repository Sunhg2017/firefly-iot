package com.songhg.firefly.iot.device.dto.certificate;

import com.songhg.firefly.iot.common.enums.CertificateStatus;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "设备证书")
public class DeviceCertificateVO {

    private Long id;
    private Long deviceId;
    private String serialNumber;
    private String subjectDn;
    private String fingerprintSha256;
    private CertificateStatus status;
    private LocalDateTime validFrom;
    private LocalDateTime validTo;
    private LocalDateTime createdAt;
}
