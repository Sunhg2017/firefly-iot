package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.dto.certificate.DeviceCertificateCreateDTO;
import com.songhg.firefly.iot.device.dto.certificate.DeviceCertificateVO;
import com.songhg.firefly.iot.device.dto.certificate.SasTokenVO;
import com.songhg.firefly.iot.device.service.DeviceCertificateService;
import com.songhg.firefly.iot.device.service.SasTokenService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "设备安全凭证", description = "设备 X.509 证书与 SAS 时效令牌")
@RestController
@RequestMapping("/api/v1/devices")
@RequiredArgsConstructor
public class DeviceSecurityController {

    private final DeviceCertificateService certificateService;
    private final SasTokenService sasTokenService;

    @GetMapping("/{id}/certificates")
    @RequiresPermission("device:read")
    @Operation(summary = "查询设备证书")
    public R<List<DeviceCertificateVO>> listCertificates(@PathVariable Long id) {
        return R.ok(certificateService.list(id));
    }

    @PostMapping("/{id}/certificates")
    @RequiresPermission("device:update")
    @Operation(summary = "登记设备证书")
    public R<DeviceCertificateVO> registerCertificate(@PathVariable Long id,
                                                      @Valid @RequestBody DeviceCertificateCreateDTO dto) {
        return R.ok(certificateService.register(id, dto));
    }

    @PutMapping("/{id}/certificates/{certificateId}/revoke")
    @RequiresPermission("device:update")
    @Operation(summary = "吊销设备证书")
    public R<Void> revokeCertificate(@PathVariable Long id,
                                     @Parameter(description = "证书编号", required = true) @PathVariable Long certificateId) {
        certificateService.revoke(certificateId);
        return R.ok();
    }

    @DeleteMapping("/{id}/certificates/{certificateId}")
    @RequiresPermission("device:update")
    @Operation(summary = "删除设备证书")
    public R<Void> deleteCertificate(@PathVariable Long id,
                                     @Parameter(description = "证书编号", required = true) @PathVariable Long certificateId) {
        certificateService.delete(certificateId);
        return R.ok();
    }

    @PostMapping("/{id}/sas-token")
    @RequiresPermission("device:control")
    @Operation(summary = "签发设备 SAS 时效令牌")
    public R<SasTokenVO> issueSasToken(@PathVariable Long id,
                                       @Parameter(description = "有效期（秒）") @RequestParam(defaultValue = "3600") long ttlSeconds) {
        return R.ok(sasTokenService.issue(id, ttlSeconds));
    }
}
