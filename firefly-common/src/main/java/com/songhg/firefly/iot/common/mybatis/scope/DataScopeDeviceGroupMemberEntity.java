package com.songhg.firefly.iot.common.mybatis.scope;

import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

@Data
@TableName("device_group_members")
public class DataScopeDeviceGroupMemberEntity {

    private Long id;
    private Long groupId;
    private Long deviceId;
}
