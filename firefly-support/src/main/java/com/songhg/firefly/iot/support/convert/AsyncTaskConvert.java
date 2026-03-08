package com.songhg.firefly.iot.support.convert;

import com.songhg.firefly.iot.support.dto.asynctask.AsyncTaskVO;
import com.songhg.firefly.iot.support.entity.AsyncTask;
import org.mapstruct.Mapper;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface AsyncTaskConvert {

    AsyncTaskConvert INSTANCE = Mappers.getMapper(AsyncTaskConvert.class);

    AsyncTaskVO toVO(AsyncTask entity);
}
