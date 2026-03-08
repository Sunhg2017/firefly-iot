package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.io.Serializable;
import java.time.LocalDateTime;

@Data
@TableName("device_locations")
public class DeviceLocation implements Serializable {

    private static final long serialVersionUID = 1L;

    @TableId(type = IdType.AUTO)
    private Long id;
    private Long deviceId;
    private Double lng;
    private Double lat;
    private Double altitude;
    private Double speed;
    private Double heading;
    private String source;
    private LocalDateTime reportedAt;
    private LocalDateTime createdAt;
}
