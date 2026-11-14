package com.songhg.firefly.iot.device.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 连续聚合（CAGG）缺口补刷水位。
 */
@Data
@TableName("telemetry_cagg_refresh_state")
public class TelemetryCaggRefreshState {

    @TableId(type = IdType.INPUT)
    private String caggName;

    /**
     * 已完成回填的时间点（含）。
     */
    private LocalDateTime refreshedUntil;

    private LocalDateTime updatedAt;
}
