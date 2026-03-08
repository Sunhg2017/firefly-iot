package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.system.SystemConfigVO;
import com.songhg.firefly.iot.system.entity.SystemConfig;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface SystemSettingsConvert {

    SystemSettingsConvert INSTANCE = Mappers.getMapper(SystemSettingsConvert.class);

    SystemConfigVO toConfigVO(SystemConfig entity);
}
