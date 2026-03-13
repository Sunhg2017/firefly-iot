package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationTemplateUpdateDTO;
import com.songhg.firefly.iot.support.notification.dto.notification.NotificationTemplateVO;
import com.songhg.firefly.iot.support.notification.entity.NotificationTemplate;
import com.songhg.firefly.iot.support.notification.enums.NotificationChannelType;
import com.songhg.firefly.iot.support.notification.mapper.NotificationTemplateMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationTemplateService {

    private static final Pattern VAR_PATTERN = Pattern.compile("\\$\\{(\\w+)}");

    private final NotificationTemplateMapper templateMapper;

    public List<NotificationTemplateVO> listAll() {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<NotificationTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationTemplate::getTenantId, tenantId)
                .orderByAsc(NotificationTemplate::getChannel)
                .orderByAsc(NotificationTemplate::getCode);
        return templateMapper.selectList(wrapper)
                .stream()
                .map(this::toVO)
                .collect(Collectors.toList());
    }

    public List<NotificationTemplateVO> listByChannel(String channel) {
        Long tenantId = AppContextHolder.getTenantId();
        String normalizedChannel = NotificationChannelType.of(channel).code();
        LambdaQueryWrapper<NotificationTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationTemplate::getTenantId, tenantId)
                .eq(NotificationTemplate::getChannel, normalizedChannel)
                .orderByAsc(NotificationTemplate::getCode);
        return templateMapper.selectList(wrapper)
                .stream()
                .map(this::toVO)
                .collect(Collectors.toList());
    }

    public NotificationTemplateVO getById(Long id) {
        return toVO(requireTemplateEntity(id));
    }

    @Transactional
    public NotificationTemplateVO create(NotificationTemplateUpdateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        String code = generateCodeFromName(dto.getName());
        ensureCodeUnique(tenantId, code, null);

        NotificationTemplate template = new NotificationTemplate();
        template.setTenantId(tenantId);
        template.setCode(code);
        template.setName(requireText(dto.getName(), "template name"));
        template.setChannel(NotificationChannelType.of(dto.getChannel()).code());
        template.setSubject(trimToNull(dto.getSubject()));
        template.setContent(requireText(dto.getContent(), "template content"));
        template.setVariables(trimToNull(dto.getVariables()));
        template.setEnabled(dto.getEnabled() != null ? dto.getEnabled() : true);
        template.setUpdatedBy(AppContextHolder.getUserId());
        template.setCreatedAt(LocalDateTime.now());
        template.setUpdatedAt(LocalDateTime.now());
        templateMapper.insert(template);
        return toVO(template);
    }

    @Transactional
    public NotificationTemplateVO update(Long id, NotificationTemplateUpdateDTO dto) {
        NotificationTemplate template = requireTemplateEntity(id);

        if (dto.getName() != null) {
            template.setName(requireText(dto.getName(), "template name"));
        }
        if (dto.getChannel() != null) {
            template.setChannel(NotificationChannelType.of(dto.getChannel()).code());
        }
        if (dto.getSubject() != null) {
            template.setSubject(trimToNull(dto.getSubject()));
        }
        if (dto.getContent() != null) {
            template.setContent(requireText(dto.getContent(), "template content"));
        }
        if (dto.getVariables() != null) {
            template.setVariables(trimToNull(dto.getVariables()));
        }
        if (dto.getEnabled() != null) {
            template.setEnabled(dto.getEnabled());
        }
        template.setUpdatedBy(AppContextHolder.getUserId());
        template.setUpdatedAt(LocalDateTime.now());
        templateMapper.updateById(template);
        return toVO(template);
    }

    @Transactional
    public void delete(Long id) {
        templateMapper.deleteById(requireTemplateEntity(id).getId());
    }

    public NotificationTemplate getEntityByCode(String code) {
        return getEntityByCode(AppContextHolder.getTenantId(), code);
    }

    public NotificationTemplate getEntityByCode(Long tenantId, String code) {
        LambdaQueryWrapper<NotificationTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(NotificationTemplate::getTenantId, tenantId)
                .eq(NotificationTemplate::getCode, normalizeCode(code));
        return templateMapper.selectOne(wrapper);
    }

    public String render(String templateContent, Map<String, String> variables) {
        if (templateContent == null || variables == null) {
            return templateContent;
        }
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

    private NotificationTemplate requireTemplateEntity(Long id) {
        NotificationTemplate template = templateMapper.selectById(id);
        Long tenantId = AppContextHolder.getTenantId();
        if (template == null || !tenantId.equals(template.getTenantId())) {
            throw new BizException(ResultCode.NOT_FOUND, "notification template not found");
        }
        return template;
    }

    private void ensureCodeUnique(Long tenantId, String code, Long currentId) {
        NotificationTemplate existing = templateMapper.selectOne(new LambdaQueryWrapper<NotificationTemplate>()
                .eq(NotificationTemplate::getTenantId, tenantId)
                .eq(NotificationTemplate::getCode, code));
        if (existing != null && (currentId == null || !existing.getId().equals(currentId))) {
            throw new BizException(ResultCode.CONFLICT, "notification template code already exists");
        }
    }

    private String normalizeCode(String value) {
        String normalized = requireText(value, "template code")
                .replaceAll("[^A-Za-z0-9]+", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "")
                .toUpperCase(Locale.ROOT);
        if (normalized.isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, "template code is invalid");
        }
        return normalized;
    }

    private String generateCodeFromName(String name) {
        String normalized = trimToNull(name);
        if (normalized == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "template name is required");
        }
        String code = normalized
                .replaceAll("[^A-Za-z0-9]+", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "")
                .toUpperCase(Locale.ROOT);
        if (code.isBlank()) {
            code = "NOTIFICATION_TEMPLATE_" + System.currentTimeMillis();
        }
        return code;
    }

    private String requireText(String value, String fieldName) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + " is required");
        }
        return trimmed;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
