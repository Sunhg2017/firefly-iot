package com.songhg.firefly.iot.system.convert;

import com.songhg.firefly.iot.system.dto.audit.AuditLogVO;
import com.songhg.firefly.iot.system.entity.AuditLog;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface AuditLogConvert {

    AuditLogConvert INSTANCE = Mappers.getMapper(AuditLogConvert.class);

    AuditLogVO toVO(AuditLog entity);
}
