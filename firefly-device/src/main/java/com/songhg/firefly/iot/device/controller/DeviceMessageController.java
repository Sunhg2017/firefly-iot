package com.songhg.firefly.iot.device.controller;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.device.service.DeviceMessageProducer;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@Tag(name = "设备消息", description = "设备上下行消息下发")
@RestController
@RequestMapping("/api/v1/device-messages")
@RequiredArgsConstructor
public class DeviceMessageController {

    private final DeviceMessageProducer messageProducer;

    @PostMapping("/upstream")
    @RequiresPermission("device:read")
    @Operation(summary = "发布上行消息")
    public R<Void> publishUpstream(@RequestBody DeviceMessage message) {
        messageProducer.publishUpstream(message);
        return R.ok();
    }

    @PostMapping("/downstream")
    @RequiresPermission("device:control")
    @Operation(summary = "发布下行消息")
    public R<Void> publishDownstream(@RequestBody DeviceMessage message) {
        messageProducer.publishDownstream(message);
        return R.ok();
    }

    @PostMapping("/property-set")
    @RequiresPermission("device:control")
    @Operation(summary = "设置设备属性")
    public R<Void> setProperty(
            @Parameter(description = "设备 ID", required = true) @RequestParam Long deviceId,
            @RequestBody Map<String, Object> properties) {
        DeviceMessage message = DeviceMessage.builder()
                .deviceId(deviceId)
                .type(DeviceMessage.MessageType.PROPERTY_SET)
                .payload(properties)
                .build();
        messageProducer.publishDownstream(message);
        return R.ok();
    }

    @PostMapping("/service-invoke")
    @RequiresPermission("device:control")
    @Operation(summary = "调用设备服务")
    public R<Void> invokeService(
            @Parameter(description = "设备 ID", required = true) @RequestParam Long deviceId,
            @Parameter(description = "服务名称", required = true) @RequestParam String serviceName,
            @RequestBody Map<String, Object> params) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("serviceName", serviceName);
        payload.put("params", params);
        DeviceMessage message = DeviceMessage.builder()
                .deviceId(deviceId)
                .type(DeviceMessage.MessageType.SERVICE_INVOKE)
                .payload(payload)
                .build();
        messageProducer.publishDownstream(message);
        return R.ok();
    }
}
