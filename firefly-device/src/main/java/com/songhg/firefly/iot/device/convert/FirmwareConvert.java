package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareVO;
import com.songhg.firefly.iot.device.dto.firmware.FirmwareCreateDTO;
import com.songhg.firefly.iot.device.dto.firmware.FirmwareUpdateDTO;
import com.songhg.firefly.iot.device.dto.firmware.FirmwareVO;
import com.songhg.firefly.iot.device.entity.DeviceFirmware;
import com.songhg.firefly.iot.device.entity.Firmware;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface FirmwareConvert {

    FirmwareConvert INSTANCE = Mappers.getMapper(FirmwareConvert.class);

    FirmwareVO toVO(Firmware entity);

    @Mapping(target = "status", ignore = true)
    Firmware toEntity(FirmwareCreateDTO dto);

    void updateEntity(FirmwareUpdateDTO dto, @MappingTarget Firmware entity);

    DeviceFirmwareVO toDeviceFirmwareVO(DeviceFirmware entity);
}
