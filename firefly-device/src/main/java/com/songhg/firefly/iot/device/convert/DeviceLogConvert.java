package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogCreateDTO;
import com.songhg.firefly.iot.device.dto.devicelog.DeviceLogVO;
import com.songhg.firefly.iot.device.entity.DeviceLog;
import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface DeviceLogConvert {

    DeviceLogConvert INSTANCE = Mappers.getMapper(DeviceLogConvert.class);

    DeviceLogVO toVO(DeviceLog entity);

    DeviceLog toEntity(DeviceLogCreateDTO dto);
}
