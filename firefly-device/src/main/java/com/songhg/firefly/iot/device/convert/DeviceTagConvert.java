package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagBindingVO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagCreateDTO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagUpdateDTO;
import com.songhg.firefly.iot.device.dto.devicetag.DeviceTagVO;
import com.songhg.firefly.iot.device.entity.DeviceTag;
import com.songhg.firefly.iot.device.entity.DeviceTagBinding;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface DeviceTagConvert {

    DeviceTagConvert INSTANCE = Mappers.getMapper(DeviceTagConvert.class);

    DeviceTagVO toVO(DeviceTag entity);

    DeviceTag toEntity(DeviceTagCreateDTO dto);

    void updateEntity(DeviceTagUpdateDTO dto, @MappingTarget DeviceTag entity);

    DeviceTagBindingVO toBindingVO(DeviceTagBinding entity);
}
