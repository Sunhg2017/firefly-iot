package com.songhg.firefly.iot.support.notification.mapper;

import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.support.notification.entity.NotificationRecord;
import org.apache.ibatis.annotations.Mapper;

@Mapper
public interface NotificationRecordMapper extends BaseMapper<NotificationRecord> {
}
