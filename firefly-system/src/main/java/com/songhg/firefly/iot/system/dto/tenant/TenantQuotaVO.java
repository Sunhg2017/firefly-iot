package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

/**
 * Tenant quota view object.
 */
@Data
@Schema(description = "租户配额视图对象")
public class TenantQuotaVO {

    @Schema(description = "租户编号")
    private Long tenantId;

    @Schema(description = "最大设备数")
    private Integer maxDevices;

    @Schema(description = "每秒最大消息数")
    private Integer maxMsgPerSec;

    @Schema(description = "最大规则数")
    private Integer maxRules;

    @Schema(description = "数据保留天数")
    private Integer dataRetentionDays;

    @Schema(description = "最大升级存储大小")
    private Integer maxOtaStorageGb;

    @Schema(description = "每日最大接口调用次数")
    private Integer maxApiCallsDay;

    @Schema(description = "最大用户数")
    private Integer maxUsers;

    @Schema(description = "最大项目数")
    private Integer maxProjects;

    @Schema(description = "最大视频通道数")
    private Integer maxVideoChannels;

    @Schema(description = "最大视频存储大小")
    private Integer maxVideoStorageGb;

    @Schema(description = "最大共享策略数")
    private Integer maxSharePolicies;
}
