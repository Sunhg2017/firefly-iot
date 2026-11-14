package com.songhg.firefly.iot.device.dto.certificate;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
@Schema(description = "登记设备 X.509 证书")
public class DeviceCertificateCreateDTO {

    @Schema(description = "证书 PEM 内容", requiredMode = Schema.RequiredMode.REQUIRED)
    @NotBlank(message = "证书内容不能为空")
    private String certificatePem;
}
