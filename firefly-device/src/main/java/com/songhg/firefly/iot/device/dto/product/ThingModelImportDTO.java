package com.songhg.firefly.iot.device.dto.product;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

/**
 * 物模型异步导入请求DTO
 * <p>
 * 前端将Excel/JSON文件上传到MinIO后，使用fileKey注册异步导入任务，
 * 后端从MinIO读取文件并异步解析、更新物模型。
 */
@Data
@Schema(description = "物模型异步导入请求")
public class ThingModelImportDTO {

    @Schema(description = "MinIO文件Key", example = "imports/thing-model.xlsx")
    @NotBlank(message = "文件Key不能为空")
    private String fileKey;

    @Schema(description = "文件格式：JSON/XLSX", example = "XLSX")
    @NotBlank(message = "文件格式不能为空")
    private String fileFormat;

    @Schema(description = "导入类型：FULL-完整替换/PROPERTIES-仅属性/EVENTS-仅事件/SERVICES-仅服务/MERGE-合并", example = "PROPERTIES")
    private String importType = "PROPERTIES";
}
