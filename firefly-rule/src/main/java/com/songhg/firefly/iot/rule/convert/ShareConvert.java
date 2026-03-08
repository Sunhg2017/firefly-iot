package com.songhg.firefly.iot.rule.convert;

import com.songhg.firefly.iot.rule.dto.share.ShareAuditLogVO;
import com.songhg.firefly.iot.rule.dto.share.SharePolicyVO;
import com.songhg.firefly.iot.rule.entity.ShareAuditLog;
import com.songhg.firefly.iot.rule.entity.SharePolicy;
import org.mapstruct.Mapper;
import org.mapstruct.factory.Mappers;

@Mapper
public interface ShareConvert {

    ShareConvert INSTANCE = Mappers.getMapper(ShareConvert.class);

    SharePolicyVO toPolicyVO(SharePolicy entity);

    ShareAuditLogVO toAuditLogVO(ShareAuditLog entity);
}
