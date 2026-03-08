package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.ota.FirmwareCreateDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareUpdateDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareVO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskCreateDTO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskDeviceVO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskVO;
import com.songhg.firefly.iot.device.entity.Firmware;
import com.songhg.firefly.iot.device.entity.OtaTask;
import com.songhg.firefly.iot.device.entity.OtaTaskDevice;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface OtaConvert {

    OtaConvert INSTANCE = Mappers.getMapper(OtaConvert.class);

    FirmwareVO toFirmwareVO(Firmware entity);

    @Mapping(target = "status", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    Firmware toFirmwareEntity(FirmwareCreateDTO dto);

    void updateFirmwareEntity(FirmwareUpdateDTO dto, @MappingTarget Firmware entity);

    @Mapping(target = "devices", ignore = true)
    OtaTaskVO toTaskVO(OtaTask entity);

    @Mapping(target = "status", ignore = true)
    @Mapping(target = "totalCount", ignore = true)
    @Mapping(target = "successCount", ignore = true)
    @Mapping(target = "failureCount", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    OtaTask toTaskEntity(OtaTaskCreateDTO dto);

    OtaTaskDeviceVO toTaskDeviceVO(OtaTaskDevice entity);
}
