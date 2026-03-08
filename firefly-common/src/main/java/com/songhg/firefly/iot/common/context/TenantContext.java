package com.songhg.firefly.iot.common.context;

import com.songhg.firefly.iot.common.enums.IsolationLevel;
import com.songhg.firefly.iot.common.enums.TenantPlan;
import lombok.Data;

import java.io.Serializable;

@Data
public class TenantContext implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long tenantId;
    private String tenantCode;
    private TenantPlan plan;
    private IsolationLevel isolationLevel;
}
