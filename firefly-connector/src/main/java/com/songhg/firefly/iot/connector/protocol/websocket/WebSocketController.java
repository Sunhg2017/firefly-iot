package com.songhg.firefly.iot.connector.protocol.websocket;

import com.songhg.firefly.iot.common.result.R;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * WebSocket 管理接口 — 查看会话、下行消息、断开连接
 */
@Tag(name = "WebSocket 设备接入", description = "WebSocket 会话管理、下行消息推送")
@RestController
@RequestMapping("/api/v1/websocket")
@RequiredArgsConstructor
public class WebSocketController {

    private final DeviceWebSocketHandler webSocketHandler;

    // ==================== Session Management ====================

    @Operation(summary = "查看在线会话列表")
    @GetMapping("/sessions")
    public R<Collection<DeviceWebSocketHandler.SessionInfo>> listSessions() {
        return R.ok(webSocketHandler.listSessions());
    }

    @Operation(summary = "查看在线会话数量")
    @GetMapping("/sessions/count")
    public R<Integer> sessionCount() {
        return R.ok(webSocketHandler.getSessionCount());
    }

    @Operation(summary = "查看指定会话详情")
    @GetMapping("/sessions/{sessionId}")
    public R<DeviceWebSocketHandler.SessionInfo> getSession(
            @Parameter(description = "长连接会话编号", required = true) @PathVariable String sessionId) {
        DeviceWebSocketHandler.SessionInfo info = webSocketHandler.getSession(sessionId);
        if (info == null) {
            return R.fail(404, "会话不存在: " + sessionId);
        }
        return R.ok(info);
    }

    @Operation(summary = "断开指定会话")
    @DeleteMapping("/sessions/{sessionId}")
    public R<Boolean> disconnect(
            @Parameter(description = "待断开的长连接会话编号", required = true) @PathVariable String sessionId) {
        return R.ok(webSocketHandler.disconnect(sessionId));
    }

    // ==================== Messaging ====================

    @Operation(summary = "向指定会话发送消息")
    @PostMapping("/send")
    public R<Boolean> sendMessage(@RequestBody SendMessageDTO dto) {
        return R.ok(webSocketHandler.sendMessage(dto.getSessionId(), dto.getMessage()));
    }

    @Operation(summary = "广播消息到所有在线会话")
    @PostMapping("/broadcast")
    public R<Map<String, Object>> broadcast(@RequestBody BroadcastDTO dto) {
        int sent = webSocketHandler.broadcast(dto.getMessage());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sent", sent);
        result.put("total", webSocketHandler.getSessionCount());
        return R.ok(result);
    }

    // ==================== DTOs ====================

    @Data
    @Schema(description = "长连接定向发送请求")
    public static class SendMessageDTO {
        /** Target WebSocket session ID */
        @Schema(description = "目标会话编号", example = "ws-abc123")
        private String sessionId;

        /** Message content (text or JSON) */
        @Schema(description = "消息内容", example = "{\"cmd\":\"refresh\"}")
        private String message;
    }

    @Data
    @Schema(description = "长连接广播请求")
    public static class BroadcastDTO {
        /** Message content to broadcast to all connected sessions */
        @Schema(description = "广播消息内容", example = "{\"notice\":\"update available\"}")
        private String message;
    }
}
