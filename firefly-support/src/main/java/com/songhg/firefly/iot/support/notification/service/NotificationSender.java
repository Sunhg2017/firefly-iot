package com.songhg.firefly.iot.support.notification.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.notification.entity.NotificationChannel;
import com.songhg.firefly.iot.support.notification.entity.NotificationRecord;
import com.songhg.firefly.iot.support.notification.entity.MessageTemplate;
import com.songhg.firefly.iot.support.notification.enums.NotificationChannelType;
import com.songhg.firefly.iot.support.notification.mapper.NotificationChannelMapper;
import com.songhg.firefly.iot.support.notification.mapper.NotificationRecordMapper;
import com.songhg.firefly.iot.support.service.InAppMessageService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpEntity;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.net.URI;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Properties;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationSender {

    private static final int MAX_ERROR_MESSAGE_LENGTH = 500;
    private static final Long PLATFORM_CHANNEL_TENANT_ID = 0L;
    private static final String PLATFORM_TENANT_CODE = "system-ops";

    private final NotificationChannelMapper channelMapper;
    private final NotificationRecordMapper recordMapper;
    private final MessageTemplateService templateService;
    private final InAppMessageService inAppMessageService;
    private final ObjectMapper objectMapper;

    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * Keep the old method for local calls, but capture tenant information before any async handoff.
     */
    public void send(Long channelId, String templateCode, String recipient, Map<String, String> variables) {
        doSend(AppContextHolder.getTenantId(), AppContextHolder.getUserId(), channelId, templateCode, recipient, variables);
    }

    /**
     * Cross-service and async sends must carry tenant information explicitly.
     */
    @Async
    public void sendForTenant(Long tenantId, Long operatorUserId, Long channelId, String templateCode, String recipient, Map<String, String> variables) {
        doSend(tenantId, operatorUserId, channelId, templateCode, recipient, variables);
    }

    public String testChannel(Long channelId) {
        Long tenantId = resolveManagedTenantId(AppContextHolder.getTenantId(), AppContextHolder.getTenantCode());
        NotificationChannel channel = getChannel(tenantId, channelId);
        return doTestChannel(channel);
    }

    public String testTenantWebhookChannel(Long tenantId, Long channelId) {
        NotificationChannel channel = channelMapper.selectOne(new LambdaQueryWrapper<NotificationChannel>()
                .eq(NotificationChannel::getTenantId, tenantId)
                .eq(NotificationChannel::getId, channelId)
                .eq(NotificationChannel::getType, NotificationChannelType.WEBHOOK.code()));
        if (channel == null) {
            throw new BizException(ResultCode.NOT_FOUND, "tenant webhook channel not found");
        }
        return doTestChannel(channel);
    }

    private String doTestChannel(NotificationChannel channel) {
        NotificationChannelType channelType = NotificationChannelType.of(channel.getType());
        JsonNode config = parseConfig(channel);

        try {
            return switch (channelType) {
                case EMAIL -> {
                    JavaMailSenderImpl mailSender = buildMailSender(config);
                    mailSender.testConnection();
                    yield "邮件渠道连接成功";
                }
                case WEBHOOK -> {
                    validateUrl(readText(config, "url"));
                    yield "Webhook 地址校验通过";
                }
                case SMS, PHONE -> {
                    validateUrl(readText(config, "apiUrl"));
                    yield "网关地址校验通过";
                }
                case WECHAT, DINGTALK -> {
                    validateUrl(readText(config, "webhookUrl"));
                    yield "机器人地址校验通过";
                }
                case IN_APP -> "站内信渠道可用";
            };
        } catch (Exception ex) {
            return "测试失败: " + ex.getMessage();
        }
    }

    private void doSend(Long tenantId, Long operatorUserId, Long channelId, String templateCode, String recipient, Map<String, String> variables) {
        NotificationRecord record = initRecord(tenantId, channelId, templateCode, recipient);
        try {
            if (tenantId == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "tenantId is required");
            }
            if (channelId == null) {
                throw new BizException(ResultCode.PARAM_ERROR, "channelId is required");
            }
            if (templateCode == null || templateCode.isBlank()) {
                throw new BizException(ResultCode.PARAM_ERROR, "templateCode is required");
            }

            NotificationChannel channel = getEnabledChannel(tenantId, channelId);
            NotificationChannelType channelType = NotificationChannelType.of(channel.getType());
            MessageTemplate template = templateService.getEntityByCodeWithPlatformFallback(tenantId, templateCode);
            if (template == null || !Boolean.TRUE.equals(template.getEnabled())) {
                throw new BizException(ResultCode.NOT_FOUND, "notification template is missing or disabled");
            }

            Map<String, String> safeVariables = variables == null ? Collections.emptyMap() : variables;
            String subject = templateService.render(template.getSubject(), safeVariables);
            String content = templateService.render(template.getContent(), safeVariables);

            record.setChannelType(channelType.code());
            record.setSubject(subject);
            record.setContent(content);

            // Provider payloads differ by channel, but all branches use the same rendered template.
            dispatch(channelType, channel, subject, content, template.getCode(), recipient, tenantId, operatorUserId);
            record.setStatus("SUCCESS");
            record.setSentAt(LocalDateTime.now());
        } catch (Exception ex) {
            record.setStatus("FAILED");
            record.setErrorMessage(truncateError(ex));
            log.error("Notification send failed, tenantId={}, channelId={}, templateCode={}", tenantId, channelId, templateCode, ex);
        }
        saveRecord(record);
    }

    private void dispatch(
            NotificationChannelType channelType,
            NotificationChannel channel,
            String subject,
            String content,
            String templateCode,
            String recipient,
            Long tenantId,
            Long operatorUserId
    ) throws Exception {
        JsonNode config = parseConfig(channel);
        switch (channelType) {
            case EMAIL -> sendEmail(config, subject, content, requireRecipient(recipient, "email recipient"));
            case WEBHOOK -> sendWebhook(config, subject, content, templateCode, recipient);
            case SMS -> sendGatewayRequest("SMS", config, subject, content, templateCode, requireRecipient(recipient, "sms recipient"));
            case PHONE -> sendGatewayRequest("PHONE", config, subject, content, templateCode, requireRecipient(recipient, "phone recipient"));
            case WECHAT -> sendWechatRobot(config, subject, content);
            case DINGTALK -> sendDingtalkRobot(config, subject, content);
            case IN_APP -> sendInAppMessage(config, subject, content, templateCode, requireRecipient(recipient, "in-app user ids"), tenantId, operatorUserId);
        }
    }

    private void sendEmail(JsonNode config, String subject, String content, String recipient) {
        JavaMailSenderImpl mailSender = buildMailSender(config);
        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(config.path("from").asText(config.path("username").asText()));
        message.setTo(splitRecipients(recipient));
        message.setSubject(subject == null ? "" : subject);
        message.setText(content == null ? "" : content);
        mailSender.send(message);
    }

    private JavaMailSenderImpl buildMailSender(JsonNode config) {
        JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
        mailSender.setHost(readText(config, "smtpHost"));
        mailSender.setPort(config.path("smtpPort").asInt(465));
        mailSender.setUsername(readText(config, "username"));
        mailSender.setPassword(readText(config, "password"));

        Properties props = mailSender.getJavaMailProperties();
        props.put("mail.transport.protocol", "smtp");
        props.put("mail.smtp.auth", "true");
        if (config.path("useSsl").asBoolean(true)) {
            props.put("mail.smtp.ssl.enable", "true");
        } else {
            props.put("mail.smtp.starttls.enable", "true");
        }
        props.put("mail.smtp.timeout", String.valueOf(config.path("timeoutMs").asInt(10000)));
        props.put("mail.smtp.connectiontimeout", String.valueOf(config.path("connectionTimeoutMs").asInt(10000)));
        return mailSender;
    }

    private void sendWebhook(JsonNode config, String subject, String content, String templateCode, String recipient) throws Exception {
        String url = firstNonBlank(config.path("url").asText(null), recipient);
        if (url == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "webhook url is required");
        }

        String method = config.path("method").asText("POST").trim().toUpperCase(Locale.ROOT);
        HttpHeaders headers = buildHeaders(config.path("contentType").asText("application/json"), config.path("headers"));
        if (config.hasNonNull("secret")) {
            headers.set("X-Webhook-Secret", config.path("secret").asText());
        }

        String contentType = config.path("contentType").asText("application/json");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("subject", subject);
        payload.put("content", content);
        payload.put("templateCode", templateCode);
        String body = contentType.contains("json")
                ? objectMapper.writeValueAsString(payload)
                : content;
        ResponseEntity<String> response = restTemplate.exchange(url, HttpMethod.valueOf(method), new HttpEntity<>(body, headers), String.class);
        ensureSuccess(response, "Webhook");
    }

    private void sendGatewayRequest(String channelCode, JsonNode config, String subject, String content, String templateCode, String recipient) throws Exception {
        String url = readText(config, "apiUrl");
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("recipient", recipient);
        payload.put("subject", subject);
        payload.put("content", content);
        payload.put("templateCode", templateCode);
        payload.put("provider", config.path("provider").asText(null));
        payload.put("signName", config.path("signName").asText(null));
        payload.put("templateId", config.path("templateId").asText(null));
        payload.put("callerId", config.path("callerId").asText(null));

        HttpHeaders headers = buildHeaders("application/json", config.path("headers"));
        if (config.hasNonNull("token")) {
            headers.setBearerAuth(config.path("token").asText());
        }
        ResponseEntity<String> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                new HttpEntity<>(objectMapper.writeValueAsString(payload), headers),
                String.class
        );
        ensureSuccess(response, channelCode);
    }

    private void sendWechatRobot(JsonNode config, String subject, String content) throws Exception {
        String url = readText(config, "webhookUrl");
        String messageType = config.path("messageType").asText("markdown").trim().toLowerCase(Locale.ROOT);

        Map<String, Object> payload = new LinkedHashMap<>();
        if ("text".equals(messageType)) {
            payload.put("msgtype", "text");
            payload.put("text", Map.of(
                    "content", firstNonBlank(content, subject, ""),
                    "mentioned_list", readStringArray(config.path("mentionedList")),
                    "mentioned_mobile_list", readStringArray(config.path("mentionedMobileList"))
            ));
        } else {
            payload.put("msgtype", "markdown");
            payload.put("markdown", Map.of("content", firstNonBlank(content, subject, "")));
        }

        HttpHeaders headers = buildHeaders("application/json", null);
        ResponseEntity<String> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                new HttpEntity<>(objectMapper.writeValueAsString(payload), headers),
                String.class
        );
        ensureSuccess(response, "WeChat");
    }

    private void sendDingtalkRobot(JsonNode config, String subject, String content) throws Exception {
        String url = readText(config, "webhookUrl");
        String messageType = config.path("messageType").asText("markdown").trim().toLowerCase(Locale.ROOT);

        Map<String, Object> payload = new LinkedHashMap<>();
        if ("text".equals(messageType)) {
            payload.put("msgtype", "text");
            payload.put("text", Map.of("content", firstNonBlank(content, subject, "")));
        } else {
            payload.put("msgtype", "markdown");
            payload.put("markdown", Map.of(
                    "title", firstNonBlank(subject, "通知消息"),
                    "text", firstNonBlank(content, subject, "")
            ));
        }
        payload.put("at", Map.of(
                "atMobiles", readStringArray(config.path("atMobiles")),
                "isAtAll", config.path("isAtAll").asBoolean(false)
        ));

        HttpHeaders headers = buildHeaders("application/json", null);
        if (config.hasNonNull("secret")) {
            headers.set("X-DingTalk-Sign-Secret", config.path("secret").asText());
        }
        ResponseEntity<String> response = restTemplate.exchange(
                url,
                HttpMethod.POST,
                new HttpEntity<>(objectMapper.writeValueAsString(payload), headers),
                String.class
        );
        ensureSuccess(response, "DingTalk");
    }

    private void sendInAppMessage(
            JsonNode config,
            String subject,
            String content,
            String templateCode,
            String recipient,
            Long tenantId,
            Long operatorUserId
    ) {
        List<Long> userIds = splitRecipientList(recipient).stream().map(Long::valueOf).toList();
        if (userIds.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "in-app user ids are required");
        }
        inAppMessageService.sendBatch(
                tenantId,
                operatorUserId,
                userIds,
                firstNonBlank(subject, "通知消息"),
                firstNonBlank(content, ""),
                config.path("type").asText("SYSTEM"),
                config.path("level").asText("INFO"),
                config.path("source").asText("NOTIFICATION_CENTER"),
                config.path("sourceId").asText(templateCode)
        );
    }

    private NotificationRecord initRecord(Long tenantId, Long channelId, String templateCode, String recipient) {
        NotificationRecord record = new NotificationRecord();
        record.setTenantId(tenantId);
        record.setChannelId(channelId);
        record.setTemplateCode(templateCode);
        record.setRecipient(recipient);
        record.setRetryCount(0);
        record.setStatus("PENDING");
        record.setCreatedAt(LocalDateTime.now());
        return record;
    }

    private void saveRecord(NotificationRecord record) {
        try {
            recordMapper.insert(record);
        } catch (Exception ex) {
            log.error("Failed to persist notification record, channelId={}, templateCode={}", record.getChannelId(), record.getTemplateCode(), ex);
        }
    }

    private NotificationChannel getEnabledChannel(Long tenantId, Long channelId) {
        NotificationChannel channel = getChannel(tenantId, channelId);
        if (!Boolean.TRUE.equals(channel.getEnabled())) {
            throw new BizException(ResultCode.PARAM_ERROR, "notification channel is disabled");
        }
        return channel;
    }

    private NotificationChannel getChannel(Long tenantId, Long channelId) {
        NotificationChannel channel = channelMapper.selectOne(new LambdaQueryWrapper<NotificationChannel>()
                .eq(NotificationChannel::getTenantId, tenantId)
                .eq(NotificationChannel::getId, channelId));
        // 告警发送优先读取租户自有渠道，未命中时回落到平台默认渠道。
        if (channel == null && tenantId != null && !PLATFORM_CHANNEL_TENANT_ID.equals(tenantId)) {
            channel = channelMapper.selectOne(new LambdaQueryWrapper<NotificationChannel>()
                    .eq(NotificationChannel::getTenantId, PLATFORM_CHANNEL_TENANT_ID)
                    .eq(NotificationChannel::getId, channelId));
        }
        if (channel == null) {
            throw new BizException(ResultCode.NOT_FOUND, "notification channel not found");
        }
        return channel;
    }

    private Long resolveManagedTenantId(Long tenantId, String tenantCode) {
        if (tenantCode != null && PLATFORM_TENANT_CODE.equalsIgnoreCase(tenantCode)) {
            return PLATFORM_CHANNEL_TENANT_ID;
        }
        return tenantId;
    }

    private JsonNode parseConfig(NotificationChannel channel) {
        try {
            String rawConfig = channel.getConfig();
            return objectMapper.readTree(rawConfig == null || rawConfig.isBlank() ? "{}" : rawConfig);
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "channel config must be valid JSON");
        }
    }

    private HttpHeaders buildHeaders(String contentType, JsonNode headerNode) {
        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(firstNonBlank(contentType, MediaType.APPLICATION_JSON_VALUE)));
        if (headerNode != null && headerNode.isObject()) {
            headerNode.fields().forEachRemaining(entry -> headers.set(entry.getKey(), entry.getValue().asText()));
        }
        return headers;
    }

    private void ensureSuccess(ResponseEntity<String> response, String channelCode) {
        if (!response.getStatusCode().is2xxSuccessful()) {
            throw new BizException(ResultCode.INTERNAL_ERROR, channelCode + " provider returned " + response.getStatusCode());
        }
    }

    private List<String> readStringArray(JsonNode node) {
        if (node == null || !node.isArray()) {
            return List.of();
        }
        List<String> values = new ArrayList<>();
        node.forEach(item -> {
            String value = item.asText();
            if (!value.isBlank()) {
                values.add(value);
            }
        });
        return values;
    }

    private void validateUrl(String rawUrl) {
        try {
            URI.create(rawUrl);
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "invalid url: " + rawUrl);
        }
    }

    private String readText(JsonNode node, String fieldName) {
        String value = node.path(fieldName).asText(null);
        if (value == null || value.isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, "channel config field is required: " + fieldName);
        }
        return value.trim();
    }

    private String requireRecipient(String recipient, String fieldName) {
        if (recipient == null || recipient.isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, fieldName + " is required");
        }
        return recipient.trim();
    }

    private String truncateError(Exception ex) {
        String message = ex.getMessage();
        if (message == null || message.isBlank()) {
            message = ex.getClass().getSimpleName();
        }
        return message.length() > MAX_ERROR_MESSAGE_LENGTH ? message.substring(0, MAX_ERROR_MESSAGE_LENGTH) : message;
    }

    private String[] splitRecipients(String recipient) {
        return splitRecipientList(recipient).toArray(String[]::new);
    }

    private List<String> splitRecipientList(String recipient) {
        List<String> recipients = new ArrayList<>();
        for (String item : recipient.split(",")) {
            String trimmed = item.trim();
            if (!trimmed.isEmpty()) {
                recipients.add(trimmed);
            }
        }
        return recipients;
    }

    private String firstNonBlank(String... values) {
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
