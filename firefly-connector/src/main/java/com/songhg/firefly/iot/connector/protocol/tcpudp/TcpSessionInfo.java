package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.fasterxml.jackson.annotation.JsonIgnore;
import io.netty.channel.Channel;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.util.concurrent.atomic.AtomicLong;

/**
 * TCP session runtime information — tracks connection state, remote address, and message counters.
 */
@Data
@Schema(description = "会话运行信息")
public class TcpSessionInfo {

    @Schema(description = "会话唯一标识", example = "a1b2c3d4-e5f6-7890-abcd-ef1234567890")
    private String sessionId;

    @Schema(description = "通道标识", example = "00e04cfffe123456")
    private String channelId;

    @Schema(description = "传输协议", example = "TCP")
    private String protocol;

    @Schema(description = "远端地址", example = "192.168.1.100:54321")
    private String remoteAddress;

    @Schema(description = "连接建立时间", example = "1717000000000")
    private long connectTime;

    @Schema(description = "最近接收时间", example = "1717000060000")
    private long lastMessageTime;

    @JsonIgnore
    private transient Channel channel;

    @Schema(description = "累计接收消息数")
    private final AtomicLong receivedMessages = new AtomicLong(0);

    @Schema(description = "累计发送消息数")
    private final AtomicLong sentMessages = new AtomicLong(0);

    private TcpUdpBindingContext binding;

    public void incrementReceivedMessages() {
        receivedMessages.incrementAndGet();
    }

    public void incrementSentMessages() {
        sentMessages.incrementAndGet();
    }

    public long getReceivedCount() {
        return receivedMessages.get();
    }

    public long getSentCount() {
        return sentMessages.get();
    }
}
