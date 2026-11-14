package com.songhg.firefly.iot.rule.dataforward.dto;

import com.songhg.firefly.iot.common.enums.ForwardStatus;
import com.songhg.firefly.iot.common.enums.PlatformEventType;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@Schema(description = "事件订阅视图")
public class EventSubscriptionVO {

    private Long id;
    private String name;
    private List<PlatformEventType> eventTypes;
    private String webhookUrl;
    private String secret;
    private Map<String, String> headers;
    private ForwardStatus status;
    private Long deliveryCount;
    private Long successCount;
    private Long errorCount;
    private LocalDateTime lastDeliveredAt;
    private LocalDateTime createdAt;
    private LocalDateTime updatedAt;
}
