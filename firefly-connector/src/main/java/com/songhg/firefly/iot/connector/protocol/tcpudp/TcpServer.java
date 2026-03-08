package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.songhg.firefly.iot.connector.config.TcpUdpProperties;
import io.netty.bootstrap.ServerBootstrap;
import io.netty.buffer.ByteBuf;
import io.netty.buffer.Unpooled;
import io.netty.channel.*;
import io.netty.channel.nio.NioEventLoopGroup;
import io.netty.channel.socket.SocketChannel;
import io.netty.channel.socket.nio.NioServerSocketChannel;
import io.netty.handler.codec.DelimiterBasedFrameDecoder;
import io.netty.handler.codec.LineBasedFrameDecoder;
import io.netty.handler.codec.LengthFieldBasedFrameDecoder;
import io.netty.handler.codec.string.StringDecoder;
import io.netty.handler.codec.string.StringEncoder;
import io.netty.handler.timeout.IdleStateEvent;
import io.netty.handler.timeout.IdleStateHandler;
import io.netty.util.CharsetUtil;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import java.net.InetSocketAddress;
import java.time.Instant;
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

    /** sessionId -> SessionInfo */
    private final ConcurrentHashMap<String, TcpSessionInfo> sessions = new ConcurrentHashMap<>();
    /** channelId -> sessionId mapping */
    private final ConcurrentHashMap<String, String> channelToSession = new ConcurrentHashMap<>();

    public TcpServer(TcpUdpProperties properties, TcpUdpProtocolAdapter protocolAdapter) {
        this.properties = properties;
        this.protocolAdapter = protocolAdapter;
    }

    @PostConstruct
    public void start() {
        if (!properties.isEnabled() || !properties.isTcpEnabled()) {
            log.info("TCP 服务未启用");
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

                        // Idle state handler
                        if (properties.getIdleTimeoutSec() > 0) {
                            pipeline.addLast(new IdleStateHandler(
                                    properties.getIdleTimeoutSec(), 0, 0, TimeUnit.SECONDS));
                        }

                        // Frame decoder based on config
                        switch (properties.getTcpFrameDecoder().toUpperCase()) {
                            case "LENGTH":
                                pipeline.addLast(new LengthFieldBasedFrameDecoder(
                                        properties.getMaxFrameLength(), 0, 4, 0, 4));
                                break;
                            case "DELIMITER":
                                ByteBuf delimiter = Unpooled.copiedBuffer(
                                        properties.getTcpDelimiter(), CharsetUtil.UTF_8);
                                pipeline.addLast(new DelimiterBasedFrameDecoder(
                                        properties.getMaxFrameLength(), delimiter));
                                break;
                            case "LINE":
                            default:
                                pipeline.addLast(new LineBasedFrameDecoder(
                                        properties.getMaxFrameLength()));
                                break;
                        }

                        pipeline.addLast(new StringDecoder(CharsetUtil.UTF_8));
                        pipeline.addLast(new StringEncoder(CharsetUtil.UTF_8));
                        pipeline.addLast(new TcpChannelHandler());
                    }
                });

        try {
            ChannelFuture future = bootstrap.bind(properties.getTcpPort()).sync();
            serverChannel = future.channel();
            log.info("TCP 服务启动成功, 端口: {}", properties.getTcpPort());
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.error("TCP 服务启动失败", e);
        }
    }

    @PreDestroy
    public void stop() {
        if (serverChannel != null) {
            serverChannel.close();
        }
        if (bossGroup != null) bossGroup.shutdownGracefully();
        if (workerGroup != null) workerGroup.shutdownGracefully();
        sessions.clear();
        channelToSession.clear();
        log.info("TCP 服务已停止");
    }

    // ==================== Session management ====================

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
        TcpSessionInfo info = sessions.get(sessionId);
        if (info == null || info.getChannel() == null || !info.getChannel().isActive()) {
            return false;
        }
        info.getChannel().writeAndFlush(message + "\n");
        info.incrementSentMessages();
        return true;
    }

    public boolean disconnectSession(String sessionId) {
        TcpSessionInfo info = sessions.remove(sessionId);
        if (info == null) return false;
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
                info.getChannel().writeAndFlush(message + "\n");
                info.incrementSentMessages();
                count++;
            }
        }
        return count;
    }

    // ==================== Channel Handler ====================

    private class TcpChannelHandler extends SimpleChannelInboundHandler<String> {

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

            log.info("TCP 连接建立: {} -> {}", sessionId, info.getRemoteAddress());
        }

        @Override
        public void channelInactive(ChannelHandlerContext ctx) {
            String channelId = ctx.channel().id().asLongText();
            String sessionId = channelToSession.remove(channelId);
            if (sessionId != null) {
                sessions.remove(sessionId);
                log.info("TCP 连接断开: {}", sessionId);
            }
        }

        @Override
        protected void channelRead0(ChannelHandlerContext ctx, String msg) {
            String channelId = ctx.channel().id().asLongText();
            String sessionId = channelToSession.get(channelId);
            TcpSessionInfo info = sessionId != null ? sessions.get(sessionId) : null;
            if (info != null) {
                info.setLastMessageTime(Instant.now().toEpochMilli());
                info.incrementReceivedMessages();
            }

            log.debug("TCP 收到消息: session={}, msg={}", sessionId, msg);

            // Publish to Kafka via protocol adapter
            protocolAdapter.handleTcpMessage(sessionId, info, msg);
        }

        @Override
        public void userEventTriggered(ChannelHandlerContext ctx, Object evt) {
            if (evt instanceof IdleStateEvent) {
                String channelId = ctx.channel().id().asLongText();
                String sessionId = channelToSession.get(channelId);
                log.info("TCP 连接空闲超时, 关闭: {}", sessionId);
                ctx.close();
            }
        }

        @Override
        public void exceptionCaught(ChannelHandlerContext ctx, Throwable cause) {
            String channelId = ctx.channel().id().asLongText();
            String sessionId = channelToSession.get(channelId);
            log.error("TCP 连接异常: session={}, error={}", sessionId, cause.getMessage());
            ctx.close();
        }
    }
}
