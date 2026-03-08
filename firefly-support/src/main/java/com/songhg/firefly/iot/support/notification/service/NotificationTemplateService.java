package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationTemplateUpdateDTO;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationTemplateVO;
import com.songhg.firefly.iot.support.notification.entity.NotificationTemplate;
import com.songhg.firefly.iot.support.notification.mapper.NotificationTemplateMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationTemplateService {

    private final NotificationTemplateMapper templateMapper;

    private static final Pattern VAR_PATTERN = Pattern.compile("\\$\\{(\\w+)}");

    // ==================== CRUD ====================

    public List<NotificationTemplateVO> listAll() {
        Long tenantId = TenantContextHolder.getTenantId();
        LambdaQueryWrapper<NotificationTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationTemplate::getTenantId, tenantId)
                .orderByAsc(NotificationTemplate::getChannel)
                .orderByAsc(NotificationTemplate::getCode);
        return templateMapper.selectList(wrapper)
                .stream().map(this::toVO).collect(Collectors.toList());
    }

    public List<NotificationTemplateVO> listByChannel(String channel) {
        Long tenantId = TenantContextHolder.getTenantId();
        LambdaQueryWrapper<NotificationTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationTemplate::getTenantId, tenantId)
                .eq(NotificationTemplate::getChannel, channel)
                .orderByAsc(NotificationTemplate::getCode);
        return templateMapper.selectList(wrapper)
                .stream().map(this::toVO).collect(Collectors.toList());
    }

    public NotificationTemplateVO getById(Long id) {
        NotificationTemplate template = templateMapper.selectById(id);
        return template != null ? toVO(template) : null;
    }

    @Transactional
    public NotificationTemplateVO create(NotificationTemplateUpdateDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();
        NotificationTemplate template = new NotificationTemplate();
        template.setTenantId(tenantId);
        template.setCode(dto.getName().toUpperCase().replace(" ", "_"));
        template.setName(dto.getName());
        template.setChannel(dto.getChannel());
        template.setSubject(dto.getSubject());
        template.setContent(dto.getContent());
        template.setVariables(dto.getVariables());
        template.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : true);
        template.setUpdatedBy(UserContextHolder.getUserId());
        template.setCreatedAt(LocalDateTime.now());
        template.setUpdatedAt(LocalDateTime.now());
        templateMapper.insert(template);
        return toVO(template);
    }

    @Transactional
    public NotificationTemplateVO update(Long id, NotificationTemplateUpdateDTO dto) {
        NotificationTemplate template = templateMapper.selectById(id);
        if (template == null) return null;

        if (dto.getName() != null) template.setName(dto.getName());
        if (dto.getChannel() != null) template.setChannel(dto.getChannel());
        if (dto.getSubject() != null) template.setSubject(dto.getSubject());
        if (dto.getContent() != null) template.setContent(dto.getContent());
        if (dto.getVariables() != null) template.setVariables(dto.getVariables());
        if (dto.getEnabled() != null) template.setEnabled(dto.getEnabled());
        template.setUpdatedBy(UserContextHolder.getUserId());
        template.setUpdatedAt(LocalDateTime.now());
        templateMapper.updateById(template);
        return toVO(template);
    }

    @Transactional
    public void delete(Long id) {
        templateMapper.deleteById(id);
    }

    // ==================== Internal (for NotificationSender) ====================

    public NotificationTemplate getEntityByCode(String code) {
        Long tenantId = TenantContextHolder.getTenantId();
        LambdaQueryWrapper<NotificationTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationTemplate::getTenantId, tenantId)
                .eq(NotificationTemplate::getCode, code);
        return templateMapper.selectOne(wrapper);
    }

    /**
     * 渲染模板：替换 ${variable} 占位符
     */
    public String render(String templateContent, Map<String, String> variables) {
        if (templateContent == null || variables == null) return templateContent;
        Matcher matcher = VAR_PATTERN.matcher(templateContent);
        StringBuilder sb = new StringBuilder();
        while (matcher.find()) {
            String varName = matcher.group(1);
            String value = variables.getOrDefault(varName, matcher.group(0));
            matcher.appendReplacement(sb, Matcher.quoteReplacement(value));
        }
        matcher.appendTail(sb);
        return sb.toString();
    }

    // ==================== Private ====================

    private NotificationTemplateVO toVO(NotificationTemplate entity) {
        NotificationTemplateVO vo = new NotificationTemplateVO();
        vo.setId(entity.getId());
        vo.setCode(entity.getCode());
        vo.setName(entity.getName());
        vo.setChannel(entity.getChannel());
        vo.setSubject(entity.getSubject());
        vo.setContent(entity.getContent());
        vo.setVariables(entity.getVariables());
        vo.setEnabled(entity.getEnabled());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
