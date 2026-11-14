package com.songhg.firefly.iot.device.dto.remoteconfig;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.RemoteConfigStatus;
import com.songhg.firefly.iot.common.enums.RemoteConfigTargetType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "远程配置分页查询")
public class RemoteConfigQueryDTO extends PageQuery {

    private String keyword;
    private RemoteConfigStatus status;
    private RemoteConfigTargetType targetType;
}
