package com.songhg.firefly.iot.system.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("tenant_usage_realtime")
public class TenantUsageRealtime implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.INPUT)
    private Long tenantId;
    private Integer deviceCount;
    private Integer deviceOnlineCount;
    private Double currentMsgRate;
    private Integer ruleCount;
    private Long apiCallsToday;
    private Long otaStorageBytes;
    private Integer videoChannelActive;
    private Long videoStorageBytes;
    private Integer userCount;
    private Integer projectCount;
    private Integer sharePolicyCount;
    private LocalDateTime updatedAt;
}
