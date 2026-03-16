package com.songhg.firefly.iot.common.mybatis.scope;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("products")
public class DataScopeProductEntity {

    private Long id;
    private Long tenantId;
    private Long projectId;
}
