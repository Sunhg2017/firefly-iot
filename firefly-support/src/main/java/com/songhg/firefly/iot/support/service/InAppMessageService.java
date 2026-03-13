package com.songhg.firefly.iot.support.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.convert.InAppMessageConvert;
import com.songhg.firefly.iot.support.dto.message.InAppMessageCreateDTO;
import com.songhg.firefly.iot.support.dto.message.InAppMessageQueryDTO;
import com.songhg.firefly.iot.support.dto.message.InAppMessageVO;
import com.songhg.firefly.iot.support.entity.InAppMessage;
import com.songhg.firefly.iot.support.mapper.InAppMessageMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;

@Service
@RequiredArgsConstructor
public class InAppMessageService {

    private final InAppMessageMapper inAppMessageMapper;

    public IPage<InAppMessageVO> listMyMessages(InAppMessageQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        LambdaQueryWrapper<InAppMessage> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(InAppMessage::getTenantId, tenantId)
                .eq(InAppMessage::getUserId, userId);
        if (query.getType() != null && !query.getType().isBlank()) {
            wrapper.eq(InAppMessage::getType, query.getType());
        }
        if (query.getIsRead() != null) {
            wrapper.eq(InAppMessage::getIsRead, query.getIsRead());
        }
        wrapper.orderByDesc(InAppMessage::getCreatedAt);

        Page<InAppMessage> page = new Page<>(query.getPageNum(), query.getPageSize());
        return inAppMessageMapper.selectPage(page, wrapper).convert(InAppMessageConvert.INSTANCE::toVO);
    }

    public int countUnread() {
        return inAppMessageMapper.countUnread(AppContextHolder.getTenantId(), AppContextHolder.getUserId());
    }

    public void markAsRead(Long id) {
        InAppMessage message = inAppMessageMapper.selectById(id);
        if (message == null) {
            throw new BizException(ResultCode.NOT_FOUND, "in-app message not found");
        }
        if (!message.getUserId().equals(AppContextHolder.getUserId())) {
            throw new BizException(ResultCode.FORBIDDEN, "permission denied");
        }
        if (Boolean.TRUE.equals(message.getIsRead())) {
            return;
        }

        LambdaUpdateWrapper<InAppMessage> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(InAppMessage::getId, id)
                .set(InAppMessage::getIsRead, true)
                .set(InAppMessage::getReadAt, LocalDateTime.now());
        inAppMessageMapper.update(null, wrapper);
    }

    public void markAllAsRead() {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();
        LambdaUpdateWrapper<InAppMessage> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(InAppMessage::getTenantId, tenantId)
                .eq(InAppMessage::getUserId, userId)
                .eq(InAppMessage::getIsRead, false)
                .set(InAppMessage::getIsRead, true)
                .set(InAppMessage::getReadAt, LocalDateTime.now());
        inAppMessageMapper.update(null, wrapper);
    }

    public void deleteMessage(Long id) {
        InAppMessage message = inAppMessageMapper.selectById(id);
        if (message == null) {
            throw new BizException(ResultCode.NOT_FOUND, "in-app message not found");
        }
        if (!message.getUserId().equals(AppContextHolder.getUserId())) {
            throw new BizException(ResultCode.FORBIDDEN, "permission denied");
        }
        inAppMessageMapper.deleteById(id);
    }

    public InAppMessageVO sendMessage(InAppMessageCreateDTO dto) {
        InAppMessage message = new InAppMessage();
        message.setTenantId(AppContextHolder.getTenantId());
        message.setUserId(dto.getUserId());
        message.setTitle(dto.getTitle());
        message.setContent(dto.getContent());
        message.setType(dto.getType() != null ? dto.getType() : "SYSTEM");
        message.setLevel(dto.getLevel() != null ? dto.getLevel() : "INFO");
        message.setSource(dto.getSource());
        message.setSourceId(dto.getSourceId());
        message.setIsRead(false);
        message.setCreatedBy(AppContextHolder.getUserId());
        inAppMessageMapper.insert(message);
        return InAppMessageConvert.INSTANCE.toVO(message);
    }

    public void sendBatch(List<Long> userIds, String title, String content, String type, String level, String source, String sourceId) {
        sendBatch(
                AppContextHolder.getTenantId(),
                AppContextHolder.getUserId(),
                userIds,
                title,
                content,
                type,
                level,
                source,
                sourceId
        );
    }

    public void sendBatch(
            Long tenantId,
            Long createdBy,
            List<Long> userIds,
            String title,
            String content,
            String type,
            String level,
            String source,
            String sourceId
    ) {
        for (Long userId : userIds) {
            InAppMessage message = new InAppMessage();
            message.setTenantId(tenantId);
            message.setUserId(userId);
            message.setTitle(title);
            message.setContent(content);
            message.setType(type != null ? type : "SYSTEM");
            message.setLevel(level != null ? level : "INFO");
            message.setSource(source);
            message.setSourceId(sourceId);
            message.setIsRead(false);
            message.setCreatedBy(createdBy);
            inAppMessageMapper.insert(message);
        }
    }
}
