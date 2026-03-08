package com.songhg.firefly.iot.device.dto.product;

import com.songhg.firefly.iot.common.enums.DataFormat;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.ProductCategory;
import com.songhg.firefly.iot.common.enums.ProtocolType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
@Schema(description = "产品更新请求")
public class ProductUpdateDTO {

    @Schema(description = "产品名称", example = "智能温湿度传感器 Pro")
    @Size(max = 256)
    private String name;

    @Schema(description = "产品型号", example = "TH-2000 Pro")
    @Size(max = 128)
    private String model;

    @Schema(description = "产品图片 URL")
    @Size(max = 512)
    private String imageUrl;

    @Schema(description = "产品描述")
    private String description;

    @Schema(description = "项目编号")
    private Long projectId;

    @Schema(description = "产品分类")
    private ProductCategory category;

    @Schema(description = "接入协议")
    private ProtocolType protocol;

    @Schema(description = "节点类型")
    private NodeType nodeType;

    @Schema(description = "数据格式")
    private DataFormat dataFormat;

    @Schema(description = "璁惧璁よ瘉鏂瑰紡")
    private DeviceAuthType deviceAuthType;
}
