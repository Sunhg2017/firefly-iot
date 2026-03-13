package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.notification.convert.NotificationConvert;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationRecordQueryDTO;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationRecordVO;
import com.songhg.firefly.iot.support.notification.entity.NotificationRecord;
import com.songhg.firefly.iot.support.notification.mapper.NotificationRecordMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class NotificationRecordService {

    private final NotificationRecordMapper recordMapper;

    public IPage<NotificationRecordVO> listRecords(NotificationRecordQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<NotificationRecord> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<NotificationRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationRecord::getTenantId, tenantId);

        if (query.getChannelType() != null && !query.getChannelType().isBlank()) {
            wrapper.eq(NotificationRecord::getChannelType, query.getChannelType().trim().toUpperCase());
        }
        if (query.getTemplateCode() != null && !query.getTemplateCode().isBlank()) {
            wrapper.eq(NotificationRecord::getTemplateCode, query.getTemplateCode().trim());
        }
        if (query.getStatus() != null && !query.getStatus().isBlank()) {
            wrapper.eq(NotificationRecord::getStatus, query.getStatus().trim().toUpperCase());
        }
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            String keyword = query.getKeyword().trim();
            wrapper.and(w -> w.like(NotificationRecord::getRecipient, keyword)
                    .or()
                    .like(NotificationRecord::getSubject, keyword));
        }
        wrapper.orderByDesc(NotificationRecord::getCreatedAt);

        return recordMapper.selectPage(page, wrapper).convert(NotificationConvert.INSTANCE::toRecordVO);
    }

    public NotificationRecordVO getById(Long id) {
        Long tenantId = AppContextHolder.getTenantId();
        NotificationRecord record = recordMapper.selectOne(new LambdaQueryWrapper<NotificationRecord>()
                .eq(NotificationRecord::getId, id)
                .eq(NotificationRecord::getTenantId, tenantId));
        if (record == null) {
            throw new BizException(ResultCode.NOT_FOUND, "notification record not found");
        }
        return NotificationConvert.INSTANCE.toRecordVO(record);
    }
}
