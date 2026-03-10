package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

/**
 * 设备异步导入请求DTO
 * <p>
 * 前端将Excel/CSV文件上传到MinIO后，使用fileKey注册异步导入任务，
 * 后端从MinIO读取文件并异步解析、批量创建设备。
 */
@Data
@Schema(description = "设备异步导入请求")
public class DeviceImportDTO {

    @Schema(description = "产品ID", example = "1")
    @NotNull(message = "产品ID不能为空")
    private Long productId;

    @Schema(description = "项目ID（可选）")
    private Long projectId;

    @Schema(description = "MinIO文件Key", example = "imports/devices_20260310.xlsx")
    @NotBlank(message = "文件Key不能为空")
    private String fileKey;

    @Schema(description = "文件格式：XLSX/CSV", example = "XLSX")
    @NotBlank(message = "文件格式不能为空")
    private String fileFormat;

    @Schema(description = "统一描述（可选）")
    private String description;

    @Schema(description = "统一标签，逗号分隔（可选）")
    private String tags;
}
