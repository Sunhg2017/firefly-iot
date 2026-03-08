package com.songhg.firefly.iot.api.dto;

import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * 产品基础信息（跨服务传输用）
 */
@Data
public class ProductBasicVO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private Long id;
    private String productKey;
    private String name;
    private String nodeType;
    private String protocol;
    private Long tenantId;
}
