package com.songhg.firefly.iot.support.notification.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.support.notification.entity.NotificationChannel;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface NotificationChannelMapper extends BaseMapper<NotificationChannel> {
}
