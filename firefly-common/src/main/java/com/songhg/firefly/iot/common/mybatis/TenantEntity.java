package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.base.BaseEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public abstract class TenantEntity extends BaseEntity {

    private Long tenantId;
}
