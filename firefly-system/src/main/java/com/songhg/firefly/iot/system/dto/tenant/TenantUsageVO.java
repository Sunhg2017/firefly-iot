package com.songhg.firefly.iot.system.dto.tenant;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * Tenant current usage view object.
 */
@Data
@Schema(description = "租户当前用量视图对象")
public class TenantUsageVO {

    @Schema(description = "设备数量")
    private Integer deviceCount;

    @Schema(description = "在线设备数量")
    private Integer deviceOnlineCount;

    @Schema(description = "当前消息速率")
    private Double currentMsgRate;

    @Schema(description = "规则数量")
    private Integer ruleCount;

    @Schema(description = "今日接口调用次数")
    private Long apiCallsToday;

    @Schema(description = "升级存储字节数")
    private Long otaStorageBytes;

    @Schema(description = "活跃视频通道数")
    private Integer videoChannelActive;

    @Schema(description = "视频存储字节数")
    private Long videoStorageBytes;

    @Schema(description = "用户数量")
    private Integer userCount;

    @Schema(description = "项目数量")
    private Integer projectCount;

    @Schema(description = "共享策略数量")
    private Integer sharePolicyCount;

    @Schema(description = "最近更新时间")
    private LocalDateTime updatedAt;
}
