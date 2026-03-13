package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateQueryDTO;
import com.songhg.firefly.iot.support.notification.entity.MessageTemplate;
import com.songhg.firefly.iot.support.notification.enums.NotificationChannelType;
import com.songhg.firefly.iot.support.notification.mapper.MessageTemplateMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageTemplateService {

    private static final Pattern VAR_PATTERN = Pattern.compile("\\$\\{(\\w+)}");
    private static final Set<String> TEMPLATE_TYPES = Set.of("TEXT", "HTML", "MARKDOWN");

    private final MessageTemplateMapper templateMapper;

    @Transactional
    public MessageTemplate create(MessageTemplate template) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        String normalizedCode = normalizeCode(template.getCode());
        ensureCodeUnique(tenantId, normalizedCode, null);

        template.setTenantId(tenantId);
        template.setCode(normalizedCode);
        template.setName(requireText(template.getName(), "template name"));
        template.setChannel(normalizeChannel(template.getChannel()));
        template.setTemplateType(normalizeTemplateType(template.getTemplateType()));
        template.setContent(requireText(template.getContent(), "template content"));
        template.setSubject(trimToNull(template.getSubject()));
        template.setVariables(trimToNull(template.getVariables()));
        template.setDescription(trimToNull(template.getDescription()));
        template.setCreatedBy(userId);
        if (template.getEnabled() == null) {
            template.setEnabled(true);
        }

        templateMapper.insert(template);
        log.info("Message template created, id={}, code={}, channel={}", template.getId(), template.getCode(), template.getChannel());
        return template;
    }

    public MessageTemplate getById(Long id) {
        Long tenantId = AppContextHolder.getTenantId();
        MessageTemplate template = templateMapper.selectOne(new LambdaQueryWrapper<MessageTemplate>()
                .eq(MessageTemplate::getId, id)
                .eq(MessageTemplate::getTenantId, tenantId));
        if (template == null) {
            throw new BizException(ResultCode.NOT_FOUND, "message template not found");
        }
        return template;
    }

    public MessageTemplate getByCode(String code) {
        return getEntityByCode(AppContextHolder.getTenantId(), code);
    }

    public MessageTemplate getEntityByCode(Long tenantId, String code) {
        return templateMapper.selectOne(new LambdaQueryWrapper<MessageTemplate>()
                .eq(MessageTemplate::getTenantId, tenantId)
                .eq(MessageTemplate::getCode, normalizeCode(code)));
    }

    public IPage<MessageTemplate> list(MessageTemplateQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<MessageTemplate> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<MessageTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MessageTemplate::getTenantId, tenantId);
        if (query.getChannel() != null && !query.getChannel().isBlank()) {
            wrapper.eq(MessageTemplate::getChannel, normalizeChannel(query.getChannel()));
        }
        if (query.getTemplateType() != null && !query.getTemplateType().isBlank()) {
            wrapper.eq(MessageTemplate::getTemplateType, normalizeTemplateType(query.getTemplateType()));
        }
        if (query.getEnabled() != null) {
            wrapper.eq(MessageTemplate::getEnabled, query.getEnabled());
        }
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            String keyword = query.getKeyword().trim();
            wrapper.and(w -> w.like(MessageTemplate::getName, keyword)
                    .or()
                    .like(MessageTemplate::getCode, keyword));
        }
        wrapper.orderByDesc(MessageTemplate::getCreatedAt);
        return templateMapper.selectPage(page, wrapper);
    }

    public List<MessageTemplate> listByChannel(String channel) {
        Long tenantId = AppContextHolder.getTenantId();
        return templateMapper.selectList(new LambdaQueryWrapper<MessageTemplate>()
                .eq(MessageTemplate::getTenantId, tenantId)
                .eq(MessageTemplate::getChannel, normalizeChannel(channel))
                .eq(MessageTemplate::getEnabled, true)
                .orderByAsc(MessageTemplate::getCode));
    }

    @Transactional
    public MessageTemplate update(Long id, MessageTemplate update) {
        MessageTemplate template = getById(id);

        if (update.getName() != null) {
            template.setName(requireText(update.getName(), "template name"));
        }
        if (update.getChannel() != null) {
            template.setChannel(normalizeChannel(update.getChannel()));
        }
        if (update.getTemplateType() != null) {
            template.setTemplateType(normalizeTemplateType(update.getTemplateType()));
        }
        if (update.getSubject() != null) {
            template.setSubject(trimToNull(update.getSubject()));
        }
        if (update.getContent() != null) {
            template.setContent(requireText(update.getContent(), "template content"));
        }
        if (update.getVariables() != null) {
            template.setVariables(trimToNull(update.getVariables()));
        }
        if (update.getEnabled() != null) {
            template.setEnabled(update.getEnabled());
        }
        if (update.getDescription() != null) {
            template.setDescription(trimToNull(update.getDescription()));
        }

        templateMapper.updateById(template);
        return template;
    }

    @Transactional
    public void delete(Long id) {
        templateMapper.deleteById(getById(id).getId());
    }

    @Transactional
    public void toggleEnabled(Long id, boolean enabled) {
        MessageTemplate template = getById(id);
        template.setEnabled(enabled);
        templateMapper.updateById(template);
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

    public String renderByCode(String code, Map<String, String> variables) {
        MessageTemplate template = getByCode(code);
        if (template == null) {
            throw new BizException(ResultCode.NOT_FOUND, "message template not found: " + code);
        }
        return render(template.getContent(), variables);
    }

    private void ensureCodeUnique(Long tenantId, String code, Long currentId) {
        MessageTemplate existing = templateMapper.selectOne(new LambdaQueryWrapper<MessageTemplate>()
                .eq(MessageTemplate::getTenantId, tenantId)
                .eq(MessageTemplate::getCode, code));
        if (existing != null && (currentId == null || !existing.getId().equals(currentId))) {
            throw new BizException(ResultCode.CONFLICT, "message template code already exists");
        }
    }

    private String normalizeChannel(String channel) {
        return NotificationChannelType.of(channel).code();
    }

    private String normalizeTemplateType(String templateType) {
        String normalized = trimToNull(templateType);
        if (normalized == null) {
            return "TEXT";
        }
        normalized = normalized.toUpperCase(Locale.ROOT);
        if (!TEMPLATE_TYPES.contains(normalized)) {
            throw new BizException(ResultCode.PARAM_ERROR, "unsupported templateType: " + templateType);
        }
        return normalized;
    }

    private String normalizeCode(String code) {
        String normalized = requireText(code, "template code")
                .replaceAll("[^A-Za-z0-9]+", "_")
                .replaceAll("_+", "_")
                .replaceAll("^_|_$", "")
                .toUpperCase(Locale.ROOT);
        if (normalized.isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, "template code is invalid");
        }
        return normalized;
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
