package com.songhg.firefly.iot.support.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
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
        Long tenantId = TenantContextHolder.getTenantId();
        Long userId = UserContextHolder.getUserId();

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
        return inAppMessageMapper.countUnread(TenantContextHolder.getTenantId(), UserContextHolder.getUserId());
    }

    public void markAsRead(Long id) {
        InAppMessage msg = inAppMessageMapper.selectById(id);
        if (msg == null) {
            throw new BizException(ResultCode.NOT_FOUND, "站内信不存在");
        }
        if (!msg.getUserId().equals(UserContextHolder.getUserId())) {
            throw new BizException(ResultCode.FORBIDDEN, "无权操作");
        }
        if (Boolean.TRUE.equals(msg.getIsRead())) {
            return;
        }
        LambdaUpdateWrapper<InAppMessage> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(InAppMessage::getId, id)
                .set(InAppMessage::getIsRead, true)
                .set(InAppMessage::getReadAt, LocalDateTime.now());
        inAppMessageMapper.update(null, wrapper);
    }

    public void markAllAsRead() {
        Long tenantId = TenantContextHolder.getTenantId();
        Long userId = UserContextHolder.getUserId();
        LambdaUpdateWrapper<InAppMessage> wrapper = new LambdaUpdateWrapper<>();
        wrapper.eq(InAppMessage::getTenantId, tenantId)
                .eq(InAppMessage::getUserId, userId)
                .eq(InAppMessage::getIsRead, false)
                .set(InAppMessage::getIsRead, true)
                .set(InAppMessage::getReadAt, LocalDateTime.now());
        inAppMessageMapper.update(null, wrapper);
    }

    public void deleteMessage(Long id) {
        InAppMessage msg = inAppMessageMapper.selectById(id);
        if (msg == null) {
            throw new BizException(ResultCode.NOT_FOUND, "站内信不存在");
        }
        if (!msg.getUserId().equals(UserContextHolder.getUserId())) {
            throw new BizException(ResultCode.FORBIDDEN, "无权操作");
        }
        inAppMessageMapper.deleteById(id);
    }

    public InAppMessageVO sendMessage(InAppMessageCreateDTO dto) {
        InAppMessage msg = new InAppMessage();
        msg.setTenantId(TenantContextHolder.getTenantId());
        msg.setUserId(dto.getUserId());
        msg.setTitle(dto.getTitle());
        msg.setContent(dto.getContent());
        msg.setType(dto.getType() != null ? dto.getType() : "SYSTEM");
        msg.setLevel(dto.getLevel() != null ? dto.getLevel() : "INFO");
        msg.setSource(dto.getSource());
        msg.setSourceId(dto.getSourceId());
        msg.setIsRead(false);
        msg.setCreatedBy(UserContextHolder.getUserId());
        inAppMessageMapper.insert(msg);
        return InAppMessageConvert.INSTANCE.toVO(msg);
    }

    public void sendBatch(List<Long> userIds, String title, String content, String type, String level, String source, String sourceId) {
        Long tenantId = TenantContextHolder.getTenantId();
        Long createdBy = UserContextHolder.getUserId();
        for (Long userId : userIds) {
            InAppMessage msg = new InAppMessage();
            msg.setTenantId(tenantId);
            msg.setUserId(userId);
            msg.setTitle(title);
            msg.setContent(content);
            msg.setType(type != null ? type : "SYSTEM");
            msg.setLevel(level != null ? level : "INFO");
            msg.setSource(source);
            msg.setSourceId(sourceId);
            msg.setIsRead(false);
            msg.setCreatedBy(createdBy);
            inAppMessageMapper.insert(msg);
        }
    }
}
