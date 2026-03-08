package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.annotation.TableLogic;
import com.songhg.firefly.iot.common.enums.DeviceStatus;
import com.songhg.firefly.iot.common.enums.OnlineStatus;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDateTime;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("devices")
public class Device extends TenantEntity {

    private Long productId;
    private Long projectId;
    private String deviceName;
    private String deviceSecret;
    private String nickname;
    private String description;
    private DeviceStatus status;
    private OnlineStatus onlineStatus;
    private String firmwareVersion;
    private String ipAddress;
    private String tags;
    private Long gatewayId;
    private LocalDateTime lastOnlineAt;
    private LocalDateTime lastOfflineAt;
    private LocalDateTime activatedAt;
    private Long createdBy;
    @TableLogic(value = "null", delval = "now()")
    private LocalDateTime deletedAt;
}
