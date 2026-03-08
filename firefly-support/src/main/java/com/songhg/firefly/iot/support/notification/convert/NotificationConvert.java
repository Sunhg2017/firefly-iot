package com.songhg.firefly.iot.support.notification.convert;

import com.songhg.firefly.iot.support.notification.dto.notification.NotificationChannelVO;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationRecordVO;
import com.songhg.firefly.iot.support.notification.entity.NotificationChannel;
import com.songhg.firefly.iot.support.notification.entity.NotificationRecord;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface NotificationConvert {

    NotificationConvert INSTANCE = Mappers.getMapper(NotificationConvert.class);

    NotificationChannelVO toChannelVO(NotificationChannel entity);

    NotificationRecordVO toRecordVO(NotificationRecord entity);
}
