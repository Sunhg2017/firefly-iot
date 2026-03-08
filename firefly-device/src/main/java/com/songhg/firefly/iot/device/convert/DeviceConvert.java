package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.device.DeviceCreateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceUpdateDTO;
import com.songhg.firefly.iot.device.dto.device.DeviceVO;
import com.songhg.firefly.iot.device.entity.Device;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface DeviceConvert {

    DeviceConvert INSTANCE = Mappers.getMapper(DeviceConvert.class);

    DeviceVO toVO(Device entity);

    @Mapping(target = "deviceSecret", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "onlineStatus", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    Device toEntity(DeviceCreateDTO dto);

    void updateEntity(DeviceUpdateDTO dto, @MappingTarget Device entity);
}
