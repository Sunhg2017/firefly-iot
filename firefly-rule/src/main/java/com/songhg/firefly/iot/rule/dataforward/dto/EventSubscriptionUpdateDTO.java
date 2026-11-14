package com.songhg.firefly.iot.rule.dataforward.dto;

import com.songhg.firefly.iot.common.enums.PlatformEventType;
import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;
import java.util.Map;

@Data
@Schema(description = "事件订阅更新请求")
public class EventSubscriptionUpdateDTO {

    @Schema(description = "订阅名称")
    @Size(max = 256)
    private String name;

    @Schema(description = "订阅事件类型")
    private List<PlatformEventType> eventTypes;

    @Schema(description = "回调地址")
    @Size(max = 512)
    private String webhookUrl;

    @Schema(description = "HMAC 签名密钥")
    private String secret;

    @Schema(description = "自定义请求头")
    private Map<String, String> headers;
}
