package com.songhg.firefly.iot.connector.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "firefly.tcp-udp")
public class TcpUdpProperties {

    private boolean enabled = true;

    /** TCP 服务端口 */
    private int tcpPort = 8900;

    /** UDP 服务端口 */
    private int udpPort = 8901;

    /** 是否启用 TCP 服务 */
    private boolean tcpEnabled = true;

    /** 是否启用 UDP 服务 */
    private boolean udpEnabled = true;

    /** TCP 帧解码器: LINE (换行分隔) / LENGTH (长度前缀) / DELIMITER (自定义分隔符) */
    private String tcpFrameDecoder = "LINE";

    /** 自定义分隔符 (仅 DELIMITER 模式) */
    private String tcpDelimiter = "\n";

    /** 最大帧长度 (bytes) */
    private int maxFrameLength = 65536;

    /** TCP 空闲超时 (秒)，0 表示不超时 */
    private int idleTimeoutSec = 300;

    /** Netty boss 线程数 */
    private int bossThreads = 1;

    /** Netty worker 线程数，0 表示自动 */
    private int workerThreads = 0;

    /** TCP SO_BACKLOG */
    private int soBacklog = 128;
}
