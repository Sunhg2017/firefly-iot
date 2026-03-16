package com.songhg.firefly.iot.common.mybatis.scope;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("devices")
public class DataScopeDeviceEntity {

    private Long id;
    private Long tenantId;
    private Long productId;
    private Long projectId;
    private LocalDateTime deletedAt;
}
