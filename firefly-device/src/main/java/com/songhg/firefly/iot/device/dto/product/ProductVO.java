package com.songhg.firefly.iot.device.dto.product;

import com.songhg.firefly.iot.common.enums.DataFormat;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.ProductCategory;
import com.songhg.firefly.iot.common.enums.ProductStatus;
import com.songhg.firefly.iot.common.enums.ProtocolType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "产品详情视图对象")
public class ProductVO {

    @Schema(description = "产品 ID")
    private Long id;

    @Schema(description = "项目 ID")
    private Long projectId;

    @Schema(description = "产品唯一标识", example = "pk_1234567890abcdef")
    private String productKey;

    @Schema(description = "产品名称", example = "智能温湿度传感器")
    private String name;

    @Schema(description = "产品型号", example = "TH-2000")
    private String model;

    @Schema(description = "产品图片 URL")
    private String imageUrl;

    @Schema(description = "产品描述")
    private String description;

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

    @Schema(description = "产品状态")
    private ProductStatus status;

    @Schema(description = "关联设备数量")
    private Integer deviceCount;

    @Schema(description = "创建人用户 ID")
    private Long createdBy;

    @Schema(description = "创建时间")
    private LocalDateTime createdAt;

    @Schema(description = "更新时间")
    private LocalDateTime updatedAt;
}
