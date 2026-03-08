package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.TableName;
import com.songhg.firefly.iot.common.enums.FirmwareStatus;
import com.songhg.firefly.iot.common.mybatis.TenantEntity;
import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
@TableName("firmwares")
public class Firmware extends TenantEntity {

    private Long productId;
    private String version;
    private String displayName;
    private String description;
    private String fileUrl;
    private Long fileSize;
    private String md5Checksum;
    private FirmwareStatus status;
    private Long createdBy;
}
