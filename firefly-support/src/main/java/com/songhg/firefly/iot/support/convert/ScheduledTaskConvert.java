package com.songhg.firefly.iot.support.convert;

import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskLogVO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskVO;
import com.songhg.firefly.iot.support.entity.ScheduledTask;
import com.songhg.firefly.iot.support.entity.ScheduledTaskLog;
import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface ScheduledTaskConvert {

    ScheduledTaskConvert INSTANCE = Mappers.getMapper(ScheduledTaskConvert.class);

    ScheduledTaskVO toVO(ScheduledTask entity);

    ScheduledTaskLogVO toLogVO(ScheduledTaskLog entity);
}
