package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("dict_items")
public class DictItem implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long dictTypeId;
    private String itemValue;
    private String itemLabel;
    private String itemLabel2;
    private Integer sortOrder;
    private Boolean enabled;
    private String cssClass;
    private String description;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
