package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.geo.DeviceLocationVO;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceCreateDTO;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceUpdateDTO;
import com.songhg.firefly.iot.device.dto.geo.GeoFenceVO;
import com.songhg.firefly.iot.device.entity.DeviceLocation;
import com.songhg.firefly.iot.device.entity.GeoFence;
import org.mapstruct.Mapper;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface GeoFenceConvert {

    GeoFenceConvert INSTANCE = Mappers.getMapper(GeoFenceConvert.class);

    GeoFenceVO toVO(GeoFence entity);

    GeoFence toEntity(GeoFenceCreateDTO dto);

    void updateEntity(GeoFenceUpdateDTO dto, @MappingTarget GeoFence entity);

    DeviceLocationVO toLocationVO(DeviceLocation entity);
}
