package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("open_api_catalog")
public class OpenApiCatalog {

    @TableId(type = IdType.AUTO)
    private Long id;
    private String code;
    private String name;
    private String serviceCode;
    private String httpMethod;
    private String pathPattern;
    private String permissionCode;
    private Boolean enabled;
    private Integer sortOrder;
    private String description;
    private Long createdBy;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
