package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.menu.MenuConfigVO;
import com.songhg.firefly.iot.system.entity.TenantMenuConfig;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface TenantMenuConfigConvert {

    TenantMenuConfigConvert INSTANCE = Mappers.getMapper(TenantMenuConfigConvert.class);

    MenuConfigVO toVO(TenantMenuConfig entity);
}
