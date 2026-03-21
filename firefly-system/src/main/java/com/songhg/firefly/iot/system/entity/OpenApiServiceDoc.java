package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("open_api_service_docs")
public class OpenApiServiceDoc {

    @TableId(type = IdType.AUTO)
    private Long id;

    private String serviceCode;

    private String apiDocJson;

    private LocalDateTime syncedAt;

    private LocalDateTime createdAt;

    private LocalDateTime updatedAt;
}
