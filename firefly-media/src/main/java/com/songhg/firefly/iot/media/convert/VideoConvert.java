package com.songhg.firefly.iot.media.convert;

import com.songhg.firefly.iot.media.dto.video.StreamSessionVO;
import com.songhg.firefly.iot.media.dto.video.VideoChannelVO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceCreateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceUpdateDTO;
import com.songhg.firefly.iot.media.dto.video.VideoDeviceVO;
import com.songhg.firefly.iot.media.entity.StreamSession;
import com.songhg.firefly.iot.media.entity.VideoChannel;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface VideoConvert {

    VideoConvert INSTANCE = Mappers.getMapper(VideoConvert.class);

    VideoDeviceVO toDeviceVO(VideoDevice entity);

    @Mapping(target = "status", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    VideoDevice toDeviceEntity(VideoDeviceCreateDTO dto);

    void updateDeviceEntity(VideoDeviceUpdateDTO dto, @MappingTarget VideoDevice entity);

    VideoChannelVO toChannelVO(VideoChannel entity);

    StreamSessionVO toSessionVO(StreamSession entity);
}
