package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.operationlog.OperationLogVO;
import com.songhg.firefly.iot.system.entity.OperationLog;
import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface OperationLogConvert {

    OperationLogConvert INSTANCE = Mappers.getMapper(OperationLogConvert.class);

    OperationLogVO toVO(OperationLog entity);
}
