package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.songhg.firefly.iot.connector.config.TcpUdpProperties;
import io.netty.bootstrap.Bootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelOption;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.DatagramPacket;
import io.netty.channel.socket.nio.NioDatagramChannel;
import io.netty.util.CharsetUtil;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;
import java.util.ArrayList;
import java.util.List;
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

    private final ConcurrentHashMap<String, UdpPeerInfo> peers = new ConcurrentHashMap<>();
    private final AtomicLong totalReceived = new AtomicLong(0);

    public UdpServer(TcpUdpProperties properties, TcpUdpProtocolAdapter protocolAdapter) {
        this.properties = properties;
        this.protocolAdapter = protocolAdapter;
    }

    @PostConstruct
    public void start() {
        if (!properties.isEnabled() || !properties.isUdpEnabled()) {
            log.info("UDP server disabled");
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
            log.info("UDP server started on port {}", properties.getUdpPort());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.error("UDP server startup interrupted", ex);
        }
    }

    @PreDestroy
    public void stop() {
        if (serverChannel != null) {
            serverChannel.close();
        }
        if (group != null) {
            group.shutdownGracefully();
        }
        peers.clear();
        log.info("UDP server stopped");
    }

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
        return sendTo(address, port, message == null ? new byte[0] : message.getBytes(CharsetUtil.UTF_8));
    }

    public boolean sendTo(String address, int port, byte[] payload) {
        if (serverChannel == null || !serverChannel.isActive()) {
            return false;
        }
        InetSocketAddress target = new InetSocketAddress(address, port);
        ByteBuf buf = Unpooled.wrappedBuffer(payload == null ? new byte[0] : payload);
        serverChannel.writeAndFlush(new DatagramPacket(buf, target));
        return true;
    }

    public List<UdpPeerInfo> listPeersByDeviceId(Long deviceId) {
        if (deviceId == null) {
            return List.of();
        }
        List<UdpPeerInfo> matched = new ArrayList<>();
        for (UdpPeerInfo peerInfo : peers.values()) {
            if (peerInfo == null
                    || peerInfo.getBinding() == null
                    || !deviceId.equals(peerInfo.getBinding().getDeviceId())) {
                continue;
            }
            matched.add(peerInfo);
        }
        return matched;
    }

    private String buildPeerKey(String address, int port) {
        return address + ":" + port;
    }

    private class UdpChannelHandler extends SimpleChannelInboundHandler<DatagramPacket> {

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, DatagramPacket packet) {
            ByteBuf content = packet.content();
            byte[] payload = new byte[content.readableBytes()];
            content.getBytes(content.readerIndex(), payload);
            InetSocketAddress sender = packet.sender();
            String senderKey = buildPeerKey(sender.getHostString(), sender.getPort());

            totalReceived.incrementAndGet();

            UdpPeerInfo peerInfo = peers.computeIfAbsent(senderKey, key -> {
                UdpPeerInfo info = new UdpPeerInfo();
                info.setAddress(sender.getHostString());
                info.setPort(sender.getPort());
                info.setFirstSeenTime(System.currentTimeMillis());
                return info;
            });
            peerInfo.setLastMessageTime(System.currentTimeMillis());
            peerInfo.incrementReceivedMessages();

            log.debug("UDP payload received: from={}, bytes={}", senderKey, payload.length);

            protocolAdapter.handleUdpMessage(senderKey, peerInfo, payload);
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            log.error("UDP server error: {}", cause.getMessage());
        }
    }

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
