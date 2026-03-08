package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.project.ProjectCreateDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectDeviceVO;
import com.songhg.firefly.iot.system.dto.project.ProjectMemberVO;
import com.songhg.firefly.iot.system.dto.project.ProjectUpdateDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectVO;
import com.songhg.firefly.iot.system.entity.Project;
import com.songhg.firefly.iot.system.entity.ProjectDevice;
import com.songhg.firefly.iot.system.entity.ProjectMember;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface ProjectConvert {

    ProjectConvert INSTANCE = Mappers.getMapper(ProjectConvert.class);

    ProjectVO toVO(Project entity);

    @Mapping(target = "status", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    Project toEntity(ProjectCreateDTO dto);

    void updateEntity(ProjectUpdateDTO dto, @MappingTarget Project entity);

    ProjectMemberVO toMemberVO(ProjectMember entity);

    ProjectDeviceVO toDeviceVO(ProjectDevice entity);
}
