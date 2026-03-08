package com.songhg.firefly.iot.common.base;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import lombok.Data;

import java.io.Serializable;

@Data
public class PageQuery implements Serializable {

    private static final long serialVersionUID = 1L;

    @Min(1)
    private int pageNum = 1;

    @Min(1)
    @Max(200)
    private int pageSize = 20;

    private String orderBy;

    private boolean asc = true;
}
