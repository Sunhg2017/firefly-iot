package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.songhg.firefly.iot.common.result.R;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.media.Schema;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * TCP/UDP 原始 Socket 管理接口 — 查看会话/端点、下行消息、断开连接
 */
@Tag(name = "TCP/UDP 设备接入", description = "TCP/UDP 原始 Socket 会话管理、下行消息推送")
@RestController
@RequestMapping("/api/v1/tcp-udp")
@RequiredArgsConstructor
public class TcpUdpController {

    private final TcpServer tcpServer;
    private final UdpServer udpServer;
    private final TcpUdpBindingService tcpUdpBindingService;

    // ==================== TCP Session Management ====================

    @Operation(summary = "查看 TCP 在线会话列表")
    @GetMapping("/tcp/sessions")
    public R<Collection<TcpSessionInfo>> listTcpSessions() {
        return R.ok(tcpServer.getSessions().values());
    }

    @Operation(summary = "查看 TCP 在线会话数量")
    @GetMapping("/tcp/sessions/count")
    public R<Integer> tcpSessionCount() {
        return R.ok(tcpServer.getSessionCount());
    }

    @Operation(summary = "查看指定 TCP 会话详情")
    @GetMapping("/tcp/sessions/{sessionId}")
    public R<TcpSessionInfo> getTcpSession(
            @Parameter(description = "传输控制会话编号", required = true, example = "a1b2c3d4-...") @PathVariable String sessionId) {
        TcpSessionInfo info = tcpServer.getSession(sessionId);
        if (info == null) {
            return R.fail(404, "TCP 会话不存在: " + sessionId);
        }
        return R.ok(info);
    }

    @Operation(summary = "断开指定 TCP 会话")
    @DeleteMapping("/tcp/sessions/{sessionId}")
    public R<Boolean> disconnectTcp(
            @Parameter(description = "待断开的传输控制会话编号", required = true) @PathVariable String sessionId) {
        return R.ok(tcpServer.disconnectSession(sessionId));
    }

    @Operation(summary = "绑定 TCP 会话上下文")
    @PutMapping("/tcp/sessions/{sessionId}/binding")
    public R<TcpSessionInfo> bindTcpSession(@PathVariable String sessionId,
                                            @Valid @RequestBody TcpUdpBindingRequest request) {
        return R.ok(tcpUdpBindingService.bindTcpSession(sessionId, request));
    }

    @Operation(summary = "解绑 TCP 会话上下文")
    @DeleteMapping("/tcp/sessions/{sessionId}/binding")
    public R<TcpSessionInfo> unbindTcpSession(@PathVariable String sessionId) {
        return R.ok(tcpUdpBindingService.unbindTcpSession(sessionId));
    }

    @Operation(summary = "向指定 TCP 会话发送消息")
    @PostMapping("/tcp/send")
    public R<Boolean> sendTcp(@RequestBody TcpSendDTO dto) {
        return R.ok(tcpServer.sendToSession(dto.getSessionId(), dto.getMessage()));
    }

    @Operation(summary = "广播消息到所有 TCP 会话")
    @PostMapping("/tcp/broadcast")
    public R<Map<String, Object>> broadcastTcp(@RequestBody BroadcastDTO dto) {
        int sent = tcpServer.broadcast(dto.getMessage());
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("sent", sent);
        result.put("total", tcpServer.getSessionCount());
        return R.ok(result);
    }

    // ==================== UDP Management ====================

    @Operation(summary = "查看 UDP 端点列表")
    @GetMapping("/udp/peers")
    public R<Collection<UdpServer.UdpPeerInfo>> listUdpPeers() {
        return R.ok(udpServer.getPeers().values());
    }

    @Operation(summary = "查看 UDP 端点数量")
    @GetMapping("/udp/peers/count")
    public R<Integer> udpPeerCount() {
        return R.ok(udpServer.getPeerCount());
    }

    @Operation(summary = "查看 UDP 总接收消息数")
    @GetMapping("/udp/stats")
    public R<Map<String, Object>> udpStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("peerCount", udpServer.getPeerCount());
        stats.put("totalReceived", udpServer.getTotalReceived());
        return R.ok(stats);
    }

    @Operation(summary = "向指定 UDP 地址发送消息")
    @PostMapping("/udp/send")
    public R<Boolean> sendUdp(@RequestBody UdpSendDTO dto) {
        return R.ok(udpServer.sendTo(dto.getAddress(), dto.getPort(), dto.getMessage()));
    }

    @Operation(summary = "绑定 UDP 对端上下文")
    @PutMapping("/udp/peers/binding")
    public R<UdpServer.UdpPeerInfo> bindUdpPeer(@Valid @RequestBody TcpUdpBindingRequest request) {
        return R.ok(tcpUdpBindingService.bindUdpPeer(request));
    }

    @Operation(summary = "解绑 UDP 对端上下文")
    @DeleteMapping("/udp/peers/binding")
    public R<UdpServer.UdpPeerInfo> unbindUdpPeer(@RequestParam String address, @RequestParam Integer port) {
        return R.ok(tcpUdpBindingService.unbindUdpPeer(address, port));
    }

    // ==================== Combined Stats ====================

    @Operation(summary = "查看 TCP/UDP 综合统计")
    @GetMapping("/stats")
    public R<Map<String, Object>> combinedStats() {
        Map<String, Object> stats = new LinkedHashMap<>();
        stats.put("tcpSessions", tcpServer.getSessionCount());
        stats.put("udpPeers", udpServer.getPeerCount());
        stats.put("udpTotalReceived", udpServer.getTotalReceived());
        return R.ok(stats);
    }

    // ==================== DTOs ====================

    @Data
    @Schema(description = "传输控制定向发送请求")
    public static class TcpSendDTO {
        /** Target TCP session ID (UUID) */
        @Schema(description = "目标会话编号", example = "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
        private String sessionId;

        /** Message content to send (text or JSON) */
        @Schema(description = "待发送消息内容", example = "{\"cmd\":\"reboot\"}")
        private String message;
    }

    @Data
    @Schema(description = "用户数据报定向发送请求")
    public static class UdpSendDTO {
        /** Target UDP address (IP) */
        @Schema(description = "目标地址", example = "192.168.1.100")
        private String address;

        /** Target UDP port */
        @Schema(description = "目标端口", example = "8901")
        private int port;

        /** Message content to send (text or JSON) */
        @Schema(description = "待发送消息内容", example = "{\"temperature\":25.5}")
        private String message;
    }

    @Data
    @Schema(description = "传输控制广播请求")
    public static class BroadcastDTO {
        /** Message content to broadcast to all connected TCP sessions */
        @Schema(description = "广播消息内容", example = "{\"notice\":\"server maintenance\"}")
        private String message;
    }
}
