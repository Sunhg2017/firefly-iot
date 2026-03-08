package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.UserSessionVO;
import com.songhg.firefly.iot.system.entity.UserSession;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

import java.util.List;

@Mapper
public interface UserSessionConvert {

    UserSessionConvert INSTANCE = Mappers.getMapper(UserSessionConvert.class);

    UserSessionVO toVO(UserSession entity);

    List<UserSessionVO> toVOList(List<UserSession> entities);
}
