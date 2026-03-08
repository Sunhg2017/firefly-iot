package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.songhg.firefly.iot.connector.config.TcpUdpProperties;
import io.netty.bootstrap.Bootstrap;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.DatagramPacket;
import io.netty.channel.socket.nio.NioDatagramChannel;
import io.netty.util.CharsetUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.net.InetSocketAddress;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

@Slf4j
@Component
@ConditionalOnProperty(name = "firefly.tcp-udp.udp-enabled", havingValue = "true", matchIfMissing = true)
public class UdpServer {

    private final TcpUdpProperties properties;
    private final TcpUdpProtocolAdapter protocolAdapter;
    private EventLoopGroup group;
    private Channel serverChannel;

    /** 远端地址 -> 统计信息 */
    private final ConcurrentHashMap<String, UdpPeerInfo> peers = new ConcurrentHashMap<>();
    private final AtomicLong totalReceived = new AtomicLong(0);

    public UdpServer(TcpUdpProperties properties, TcpUdpProtocolAdapter protocolAdapter) {
        this.properties = properties;
        this.protocolAdapter = protocolAdapter;
    }

    @PostConstruct
    public void start() {
        if (!properties.isEnabled() || !properties.isUdpEnabled()) {
            log.info("UDP 服务未启用");
            return;
        }

        group = new NioEventLoopGroup(properties.getWorkerThreads());

        Bootstrap bootstrap = new Bootstrap();
        bootstrap.group(group)
                .channel(NioDatagramChannel.class)
                .option(ChannelOption.SO_BROADCAST, true)
                .handler(new UdpChannelHandler());

        try {
            ChannelFuture future = bootstrap.bind(properties.getUdpPort()).sync();
            serverChannel = future.channel();
            log.info("UDP 服务启动成功, 端口: {}", properties.getUdpPort());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("UDP 服务启动失败", e);
        }
    }

    @PreDestroy
    public void stop() {
        if (serverChannel != null) {
            serverChannel.close();
        }
        if (group != null) group.shutdownGracefully();
        peers.clear();
        log.info("UDP 服务已停止");
    }

    // ==================== Peer info management ====================

    public Map<String, UdpPeerInfo> getPeers() {
        return peers;
    }

    public int getPeerCount() {
        return peers.size();
    }

    public UdpPeerInfo getPeer(String address, int port) {
        return peers.get(buildPeerKey(address, port));
    }

    public long getTotalReceived() {
        return totalReceived.get();
    }

    public boolean sendTo(String address, int port, String message) {
        if (serverChannel == null || !serverChannel.isActive()) return false;
        InetSocketAddress target = new InetSocketAddress(address, port);
        io.netty.buffer.ByteBuf buf = io.netty.buffer.Unpooled.copiedBuffer(message, CharsetUtil.UTF_8);
        serverChannel.writeAndFlush(new DatagramPacket(buf, target));
        return true;
    }

    private String buildPeerKey(String address, int port) {
        return address + ":" + port;
    }

    // ==================== Channel Handler ====================

    private class UdpChannelHandler extends SimpleChannelInboundHandler<DatagramPacket> {

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, DatagramPacket packet) {
            String content = packet.content().toString(CharsetUtil.UTF_8).trim();
            InetSocketAddress sender = packet.sender();
            String senderKey = buildPeerKey(sender.getHostString(), sender.getPort());

            totalReceived.incrementAndGet();

            // Track peer info
            UdpPeerInfo peerInfo = peers.computeIfAbsent(senderKey, k -> {
                UdpPeerInfo info = new UdpPeerInfo();
                info.setAddress(sender.getHostString());
                info.setPort(sender.getPort());
                info.setFirstSeenTime(System.currentTimeMillis());
                return info;
            });
            peerInfo.setLastMessageTime(System.currentTimeMillis());
            peerInfo.incrementReceivedMessages();

            log.debug("UDP 收到消息: from={}, msg={}", senderKey, content);

            // Publish to Kafka
            protocolAdapter.handleUdpMessage(senderKey, peerInfo, content);
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            log.error("UDP 服务异常: {}", cause.getMessage());
        }
    }

    // ==================== UDP Peer Info ====================

    @lombok.Data
    public static class UdpPeerInfo {
        private String address;
        private int port;
        private long firstSeenTime;
        private long lastMessageTime;
        private final AtomicLong receivedMessages = new AtomicLong(0);
        private TcpUdpBindingContext binding;

        public void incrementReceivedMessages() {
            receivedMessages.incrementAndGet();
        }

        public long getReceivedCount() {
            return receivedMessages.get();
        }
    }
}
