package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupCreateDTO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupMemberVO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupUpdateDTO;
import com.songhg.firefly.iot.device.dto.devicegroup.DeviceGroupVO;
import com.songhg.firefly.iot.device.entity.DeviceGroup;
import com.songhg.firefly.iot.device.entity.DeviceGroupMember;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface DeviceGroupConvert {

    DeviceGroupConvert INSTANCE = Mappers.getMapper(DeviceGroupConvert.class);

    DeviceGroupVO toVO(DeviceGroup entity);

    DeviceGroup toEntity(DeviceGroupCreateDTO dto);

    void updateEntity(DeviceGroupUpdateDTO dto, @MappingTarget DeviceGroup entity);

    DeviceGroupMemberVO toMemberVO(DeviceGroupMember entity);
}
