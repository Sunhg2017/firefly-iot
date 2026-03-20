package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.songhg.firefly.iot.connector.config.TcpUdpProperties;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.Channel;
import io.netty.channel.ChannelFuture;
import io.netty.channel.ChannelHandlerContext;
import io.netty.channel.ChannelInitializer;
import io.netty.channel.ChannelOption;
import io.netty.channel.ChannelPipeline;
import io.netty.channel.EventLoopGroup;
import io.netty.channel.SimpleChannelInboundHandler;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.timeout.IdleStateEvent;
import io.netty.handler.timeout.IdleStateHandler;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;

@Slf4j
@Component
@ConditionalOnProperty(name = "firefly.tcp-udp.tcp-enabled", havingValue = "true", matchIfMissing = true)
public class TcpServer {

    private final TcpUdpProperties properties;
    private final TcpUdpProtocolAdapter protocolAdapter;
    private EventLoopGroup bossGroup;
    private EventLoopGroup workerGroup;
    private Channel serverChannel;

    private final ConcurrentHashMap<String, TcpSessionInfo> sessions = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, String> channelToSession = new ConcurrentHashMap<>();

    public TcpServer(TcpUdpProperties properties, TcpUdpProtocolAdapter protocolAdapter) {
        this.properties = properties;
        this.protocolAdapter = protocolAdapter;
    }

    @PostConstruct
    public void start() {
        if (!properties.isEnabled() || !properties.isTcpEnabled()) {
            log.info("TCP server disabled");
            return;
        }

        bossGroup = new NioEventLoopGroup(properties.getBossThreads());
        workerGroup = new NioEventLoopGroup(properties.getWorkerThreads());

        ServerBootstrap bootstrap = new ServerBootstrap();
        bootstrap.group(bossGroup, workerGroup)
                .channel(NioServerSocketChannel.class)
                .option(ChannelOption.SO_BACKLOG, properties.getSoBacklog())
                .childOption(ChannelOption.SO_KEEPALIVE, true)
                .childOption(ChannelOption.TCP_NODELAY, true)
                .childHandler(new ChannelInitializer<SocketChannel>() {
                    @Override
                    protected void initChannel(SocketChannel ch) {
                        ChannelPipeline pipeline = ch.pipeline();
                        if (properties.getIdleTimeoutSec() > 0) {
                            pipeline.addLast(new IdleStateHandler(
                                    properties.getIdleTimeoutSec(), 0, 0, TimeUnit.SECONDS));
                        }
                        pipeline.addLast(new TcpChannelHandler());
                    }
                });

        try {
            ChannelFuture future = bootstrap.bind(properties.getTcpPort()).sync();
            serverChannel = future.channel();
            log.info("TCP server started on port {}", properties.getTcpPort());
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            log.error("TCP server startup interrupted", ex);
        }
    }

    @PreDestroy
    public void stop() {
        if (serverChannel != null) {
            serverChannel.close();
        }
        if (bossGroup != null) {
            bossGroup.shutdownGracefully();
        }
        if (workerGroup != null) {
            workerGroup.shutdownGracefully();
        }
        sessions.clear();
        channelToSession.clear();
        log.info("TCP server stopped");
    }

    public Map<String, TcpSessionInfo> getSessions() {
        return sessions;
    }

    public TcpSessionInfo getSession(String sessionId) {
        return sessions.get(sessionId);
    }

    public int getSessionCount() {
        return sessions.size();
    }

    public boolean sendToSession(String sessionId, String message) {
        return sendToSession(sessionId, message == null ? new byte[0] : message.getBytes(StandardCharsets.UTF_8), true);
    }

    public boolean sendToSession(String sessionId, byte[] payload, boolean appendLineDelimiter) {
        TcpSessionInfo info = sessions.get(sessionId);
        if (info == null || info.getChannel() == null || !info.getChannel().isActive()) {
            return false;
        }
        byte[] outgoing = payload == null ? new byte[0] : payload;
        if (appendLineDelimiter) {
            byte[] withDelimiter = new byte[outgoing.length + 1];
            System.arraycopy(outgoing, 0, withDelimiter, 0, outgoing.length);
            withDelimiter[outgoing.length] = '\n';
            outgoing = withDelimiter;
        }
        info.getChannel().writeAndFlush(Unpooled.wrappedBuffer(outgoing));
        info.incrementSentMessages();
        return true;
    }

    public boolean disconnectSession(String sessionId) {
        TcpSessionInfo info = sessions.remove(sessionId);
        if (info == null) {
            return false;
        }
        channelToSession.remove(info.getChannelId());
        if (info.getChannel() != null && info.getChannel().isActive()) {
            info.getChannel().close();
        }
        return true;
    }

    public int broadcast(String message) {
        int count = 0;
        for (TcpSessionInfo info : sessions.values()) {
            if (info.getChannel() != null && info.getChannel().isActive()) {
                info.getChannel().writeAndFlush(Unpooled.copiedBuffer(message + "\n", StandardCharsets.UTF_8));
                info.incrementSentMessages();
                count++;
            }
        }
        return count;
    }

    public List<TcpSessionInfo> listSessionsByDeviceId(Long deviceId) {
        if (deviceId == null) {
            return List.of();
        }
        List<TcpSessionInfo> matched = new ArrayList<>();
        for (TcpSessionInfo sessionInfo : sessions.values()) {
            if (sessionInfo == null
                    || sessionInfo.getBinding() == null
                    || !deviceId.equals(sessionInfo.getBinding().getDeviceId())
                    || sessionInfo.getChannel() == null
                    || !sessionInfo.getChannel().isActive()) {
                continue;
            }
            matched.add(sessionInfo);
        }
        return matched;
    }

    private class TcpChannelHandler extends SimpleChannelInboundHandler<ByteBuf> {

        @Override
        public void channelActive(ChannelHandlerContext ctx) {
            String channelId = ctx.channel().id().asLongText();
            InetSocketAddress remote = (InetSocketAddress) ctx.channel().remoteAddress();
            String sessionId = "tcp-" + channelId.substring(0, Math.min(16, channelId.length()));

            TcpSessionInfo info = new TcpSessionInfo();
            info.setSessionId(sessionId);
            info.setChannelId(channelId);
            info.setProtocol("TCP");
            info.setRemoteAddress(remote.getHostString() + ":" + remote.getPort());
            info.setConnectTime(Instant.now().toEpochMilli());
            info.setChannel(ctx.channel());

            sessions.put(sessionId, info);
            channelToSession.put(channelId, sessionId);

            log.info("TCP connection established: {} -> {}", sessionId, info.getRemoteAddress());
        }

        @Override
        public void channelInactive(ChannelHandlerContext ctx) {
            String channelId = ctx.channel().id().asLongText();
            String sessionId = channelToSession.remove(channelId);
            if (sessionId != null) {
                sessions.remove(sessionId);
                log.info("TCP connection closed: {}", sessionId);
            }
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, ByteBuf msg) {
            String channelId = ctx.channel().id().asLongText();
            String sessionId = channelToSession.get(channelId);
            TcpSessionInfo info = sessionId != null ? sessions.get(sessionId) : null;
            if (info != null) {
                info.setLastMessageTime(Instant.now().toEpochMilli());
                info.incrementReceivedMessages();
            }

            byte[] payload = new byte[msg.readableBytes()];
            msg.getBytes(msg.readerIndex(), payload);
            log.debug("TCP payload received: session={}, bytes={}", sessionId, payload.length);

            protocolAdapter.handleTcpMessage(sessionId, info, payload);
        }

        @Override
        public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
            if (evt instanceof IdleStateEvent) {
                String channelId = ctx.channel().id().asLongText();
                String sessionId = channelToSession.get(channelId);
                log.info("TCP connection idle timeout: {}", sessionId);
                ctx.close();
            }
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            String channelId = ctx.channel().id().asLongText();
            String sessionId = channelToSession.get(channelId);
            log.error("TCP connection error: session={}, error={}", sessionId, cause.getMessage());
            ctx.close();
        }
    }
}
