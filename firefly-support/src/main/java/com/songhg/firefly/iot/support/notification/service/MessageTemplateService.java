package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.notification.dto.messagetemplate.MessageTemplateQueryDTO;
import com.songhg.firefly.iot.support.notification.entity.MessageTemplate;
import com.songhg.firefly.iot.support.notification.mapper.MessageTemplateMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Slf4j
@Service
@RequiredArgsConstructor
public class MessageTemplateService {

    private final MessageTemplateMapper templateMapper;

    private static final Pattern VAR_PATTERN = Pattern.compile("\\$\\{(\\w+)}");

    @Transactional
    public MessageTemplate create(MessageTemplate template) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        Long exists = templateMapper.selectCount(new LambdaQueryWrapper<MessageTemplate>()
                .eq(MessageTemplate::getTenantId, tenantId)
                .eq(MessageTemplate::getCode, template.getCode()));
        if (exists > 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "模板编码已存在");
        }

        template.setTenantId(tenantId);
        template.setCreatedBy(userId);
        if (template.getEnabled() == null) template.setEnabled(true);
        templateMapper.insert(template);
        log.info("MessageTemplate created: id={}, code={}, channel={}", template.getId(), template.getCode(), template.getChannel());
        return template;
    }

    public MessageTemplate getById(Long id) {
        MessageTemplate t = templateMapper.selectById(id);
        if (t == null) throw new BizException(ResultCode.PARAM_ERROR, "模板不存在");
        return t;
    }

    public MessageTemplate getByCode(String code) {
        Long tenantId = AppContextHolder.getTenantId();
        return templateMapper.selectOne(new LambdaQueryWrapper<MessageTemplate>()
                .eq(MessageTemplate::getTenantId, tenantId)
                .eq(MessageTemplate::getCode, code));
    }

    public IPage<MessageTemplate> list(MessageTemplateQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<MessageTemplate> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<MessageTemplate> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(MessageTemplate::getTenantId, tenantId);
        if (query.getChannel() != null && !query.getChannel().isBlank()) {
            wrapper.eq(MessageTemplate::getChannel, query.getChannel());
        }
        if (query.getTemplateType() != null && !query.getTemplateType().isBlank()) {
            wrapper.eq(MessageTemplate::getTemplateType, query.getTemplateType());
        }
        if (query.getEnabled() != null) {
            wrapper.eq(MessageTemplate::getEnabled, query.getEnabled());
        }
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(MessageTemplate::getName, query.getKeyword()).or().like(MessageTemplate::getCode, query.getKeyword()));
        }
        wrapper.orderByDesc(MessageTemplate::getCreatedAt);
        return templateMapper.selectPage(page, wrapper);
    }

    public List<MessageTemplate> listByChannel(String channel) {
        Long tenantId = AppContextHolder.getTenantId();
        return templateMapper.selectList(new LambdaQueryWrapper<MessageTemplate>()
                .eq(MessageTemplate::getTenantId, tenantId)
                .eq(MessageTemplate::getChannel, channel)
                .eq(MessageTemplate::getEnabled, true)
                .orderByAsc(MessageTemplate::getCode));
    }

    @Transactional
    public MessageTemplate update(Long id, MessageTemplate update) {
        MessageTemplate t = getById(id);
        if (update.getName() != null) t.setName(update.getName());
        if (update.getChannel() != null) t.setChannel(update.getChannel());
        if (update.getTemplateType() != null) t.setTemplateType(update.getTemplateType());
        if (update.getSubject() != null) t.setSubject(update.getSubject());
        if (update.getContent() != null) t.setContent(update.getContent());
        if (update.getVariables() != null) t.setVariables(update.getVariables());
        if (update.getEnabled() != null) t.setEnabled(update.getEnabled());
        if (update.getDescription() != null) t.setDescription(update.getDescription());
        templateMapper.updateById(t);
        return t;
    }

    @Transactional
    public void delete(Long id) {
        templateMapper.deleteById(id);
    }

    @Transactional
    public void toggleEnabled(Long id, boolean enabled) {
        MessageTemplate t = getById(id);
        t.setEnabled(enabled);
        templateMapper.updateById(t);
    }

    /**
     * 渲染模板：将 ${variable} 替换为实际值
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

    /**
     * 根据模板编码渲染消息
     */
    public String renderByCode(String code, Map<String, String> variables) {
        MessageTemplate t = getByCode(code);
        if (t == null) throw new BizException(ResultCode.PARAM_ERROR, "模板不存在: " + code);
        return render(t.getContent(), variables);
    }
}
