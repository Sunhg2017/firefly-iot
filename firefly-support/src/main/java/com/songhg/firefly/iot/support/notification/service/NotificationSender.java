package com.songhg.firefly.iot.support.notification.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.support.notification.entity.NotificationChannel;
import com.songhg.firefly.iot.support.notification.entity.NotificationRecord;
import com.songhg.firefly.iot.support.notification.mapper.NotificationChannelMapper;
import com.songhg.firefly.iot.support.notification.mapper.NotificationRecordMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.*;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSenderImpl;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.time.LocalDateTime;
import java.util.Map;
import java.util.Properties;

@Slf4j
@Service
@RequiredArgsConstructor
public class NotificationSender {

    private final NotificationChannelMapper channelMapper;
    private final NotificationRecordMapper recordMapper;
    private final NotificationTemplateService templateService;
    private final ObjectMapper objectMapper;
    private final RestTemplate restTemplate = new RestTemplate();

    /**
     * 发送通知（异步）
     */
    @Async
    public void send(Long channelId, String templateCode, String recipient, Map<String, String> variables) {
        NotificationChannel channel = channelMapper.selectById(channelId);
        if (channel == null || !channel.getEnabled()) {
            log.warn("Channel {} is null or disabled", channelId);
            return;
        }

        var template = templateService.getEntityByCode(templateCode);
        String subject = template != null ? templateService.render(template.getSubject(), variables) : "";
        String content = template != null ? templateService.render(template.getContent(), variables) : "";

        NotificationRecord record = new NotificationRecord();
        record.setTenantId(AppContextHolder.getTenantId());
        record.setChannelId(channelId);
        record.setChannelType(channel.getType());
        record.setTemplateCode(templateCode);
        record.setSubject(subject);
        record.setContent(content);
        record.setRecipient(recipient);
        record.setRetryCount(0);
        record.setCreatedAt(LocalDateTime.now());

        try {
            switch (channel.getType().toUpperCase()) {
                case "EMAIL" -> sendEmail(channel, subject, content, recipient);
                case "WEBHOOK" -> sendWebhook(channel, content);
                case "SMS" -> log.info("SMS sending not implemented, recipient={}, content={}", recipient, content);
                default -> log.warn("Unsupported channel type: {}", channel.getType());
            }
            record.setStatus("SUCCESS");
            record.setSentAt(LocalDateTime.now());
        } catch (Exception e) {
            record.setStatus("FAILED");
            String errMsg = e.getMessage();
            if (errMsg != null && errMsg.length() > 500) errMsg = errMsg.substring(0, 500);
            record.setErrorMessage(errMsg);
            log.error("Failed to send notification via channel {}: {}", channelId, e.getMessage());
        }

        try {
            recordMapper.insert(record);
        } catch (Exception e) {
            log.error("Failed to save notification record: {}", e.getMessage());
        }
    }

    private void sendEmail(NotificationChannel channel, String subject, String content, String recipient) throws Exception {
        JsonNode config = objectMapper.readTree(channel.getConfig());
        JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
        mailSender.setHost(config.path("smtpHost").asText());
        mailSender.setPort(config.path("smtpPort").asInt(465));
        mailSender.setUsername(config.path("username").asText());
        mailSender.setPassword(config.path("password").asText());

        Properties props = mailSender.getJavaMailProperties();
        props.put("mail.transport.protocol", "smtp");
        props.put("mail.smtp.auth", "true");
        boolean useSsl = config.path("useSsl").asBoolean(true);
        if (useSsl) {
            props.put("mail.smtp.ssl.enable", "true");
        } else {
            props.put("mail.smtp.starttls.enable", "true");
        }
        props.put("mail.smtp.timeout", "10000");
        props.put("mail.smtp.connectiontimeout", "10000");

        SimpleMailMessage message = new SimpleMailMessage();
        message.setFrom(config.path("from").asText(config.path("username").asText()));
        message.setTo(recipient.split(","));
        message.setSubject(subject);
        message.setText(content);
        mailSender.send(message);
        log.info("Email sent to {} via {}", recipient, config.path("smtpHost").asText());
    }

    private void sendWebhook(NotificationChannel channel, String content) throws Exception {
        JsonNode config = objectMapper.readTree(channel.getConfig());
        String url = config.path("url").asText();
        String method = config.path("method").asText("POST").toUpperCase();
        String contentType = config.path("contentType").asText("application/json");

        HttpHeaders headers = new HttpHeaders();
        headers.setContentType(MediaType.parseMediaType(contentType));
        if (config.has("headers")) {
            config.path("headers").fields().forEachRemaining(entry ->
                    headers.set(entry.getKey(), entry.getValue().asText()));
        }
        if (config.has("secret")) {
            headers.set("X-Webhook-Secret", config.path("secret").asText());
        }

        HttpEntity<String> entity = new HttpEntity<>(content, headers);
        ResponseEntity<String> response;

        if ("GET".equals(method)) {
            response = restTemplate.exchange(url, HttpMethod.GET, entity, String.class);
        } else {
            response = restTemplate.exchange(url, HttpMethod.POST, entity, String.class);
        }
        log.info("Webhook sent to {}, status={}", url, response.getStatusCode());
    }

    /**
     * 测试渠道连接
     */
    public String testChannel(Long channelId) {
        NotificationChannel channel = channelMapper.selectById(channelId);
        if (channel == null) return "渠道不存在";

        try {
            switch (channel.getType().toUpperCase()) {
                case "EMAIL" -> {
                    JsonNode config = objectMapper.readTree(channel.getConfig());
                    JavaMailSenderImpl mailSender = new JavaMailSenderImpl();
                    mailSender.setHost(config.path("smtpHost").asText());
                    mailSender.setPort(config.path("smtpPort").asInt(465));
                    mailSender.setUsername(config.path("username").asText());
                    mailSender.setPassword(config.path("password").asText());
                    Properties props = mailSender.getJavaMailProperties();
                    props.put("mail.transport.protocol", "smtp");
                    props.put("mail.smtp.auth", "true");
                    props.put("mail.smtp.ssl.enable", String.valueOf(config.path("useSsl").asBoolean(true)));
                    props.put("mail.smtp.timeout", "5000");
                    mailSender.testConnection();
                    return "邮件服务器连接成功";
                }
                case "WEBHOOK" -> {
                    JsonNode config = objectMapper.readTree(channel.getConfig());
                    String url = config.path("url").asText();
                    restTemplate.headForHeaders(url);
                    return "Webhook 连接成功";
                }
                default -> { return "不支持测试此渠道类型"; }
            }
        } catch (Exception e) {
            return "连接失败: " + e.getMessage();
        }
    }
}
