package com.songhg.firefly.iot.media.zlm;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.media.config.ZlmProperties;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * ZLMediaKit REST API 客户端
 * <p>
 * 核心 API 参考: https://docs.zlmediakit.com/zh/guide/media_server/restful_api.html
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ZlmApiClient {

    private final ZlmProperties zlmProperties;
    private final ObjectMapper objectMapper;

    private static final String DEFAULT_VHOST = "__defaultVhost__";

    private static final HttpClient HTTP_CLIENT = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(5))
            .build();

    // ==================== 通用请求 ====================

    private String doGet(String path, Map<String, String> params) {
        StringBuilder url = new StringBuilder(zlmProperties.getApiUrl() + path);
        url.append("?secret=").append(zlmProperties.getSecret());
        if (params != null) {
            params.forEach((k, v) -> url.append("&").append(k).append("=").append(v));
        }
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url.toString()))
                    .timeout(Duration.ofSeconds(10))
                    .GET()
                    .build();
            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            log.debug("ZLM GET {} -> {}", path, response.statusCode());
            ensureSuccessStatus(path, response.statusCode(), response.body());
            return response.body();
        } catch (IOException | InterruptedException e) {
            log.error("ZLM API GET error: path={}, error={}", path, e.getMessage());
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new BizException(ResultCode.INTERNAL_ERROR, "ZLMediaKit API 调用失败: " + e.getMessage());
        }
    }

    private String doPost(String path, Map<String, Object> body) {
        String url = zlmProperties.getApiUrl() + path + "?secret=" + zlmProperties.getSecret();
        try {
            String jsonBody = objectMapper.writeValueAsString(body);
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .timeout(Duration.ofSeconds(10))
                    .header("Content-Type", "application/json")
                    .POST(HttpRequest.BodyPublishers.ofString(jsonBody))
                    .build();
            HttpResponse<String> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofString());
            log.debug("ZLM POST {} -> {}", path, response.statusCode());
            ensureSuccessStatus(path, response.statusCode(), response.body());
            return response.body();
        } catch (IOException | InterruptedException e) {
            log.error("ZLM API POST error: path={}, error={}", path, e.getMessage());
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            throw new BizException(ResultCode.INTERNAL_ERROR, "ZLMediaKit API 调用失败: " + e.getMessage());
        }
    }

    private void ensureSuccessStatus(String path, int statusCode, String body) {
        if (statusCode >= 200 && statusCode < 300) {
            return;
        }
        String briefBody = abbreviateBody(body);
        log.warn("ZLM API returned non-success status: path={}, status={}, body={}", path, statusCode, briefBody);
        throw new BizException(ResultCode.INTERNAL_ERROR,
                "ZLMediaKit API 调用失败: path=" + path + ", status=" + statusCode + ", body=" + briefBody);
    }

    private String abbreviateBody(String body) {
        if (body == null) {
            return "null";
        }
        String normalized = body.replaceAll("\\s+", " ").trim();
        if (normalized.length() <= 300) {
            return normalized;
        }
        return normalized.substring(0, 300) + "...";
    }

    // ==================== 服务器信息 ====================

    /**
     * 获取服务器配置
     * GET /index/api/getServerConfig
     */
    public Map<String, Object> getServerConfig() {
        String json = doGet("/index/api/getServerConfig", null);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM getServerConfig 响应失败");
        }
    }

    // ==================== 流代理 (RTSP/RTMP 拉流) ====================

    /**
     * 添加流代理 (拉流)
     * POST /index/api/addStreamProxy
     *
     * @param app    应用名 (如 "live")
     * @param stream 流ID
     * @param url    拉流地址 (RTSP/RTMP)
     * @return ZlmResponse 包含 key (用于关闭代理)
     */
    public ZlmResponse<Map<String, Object>> addStreamProxy(String app, String stream, String url) {
        Map<String, Object> body = new HashMap<>();
        body.put("vhost", DEFAULT_VHOST);
        body.put("app", app);
        body.put("stream", stream);
        body.put("url", url);
        body.put("enable_hls", 1);
        body.put("enable_mp4", 0);
        body.put("rtp_type", 0);
        String json = doPost("/index/api/addStreamProxy", body);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM addStreamProxy 响应失败");
        }
    }

    /**
     * 关闭流代理
     * POST /index/api/delStreamProxy
     *
     * @param key addStreamProxy 返回的 key
     */
    public ZlmResponse<Map<String, Object>> delStreamProxy(String key) {
        Map<String, Object> body = new HashMap<>();
        body.put("key", key);
        String json = doPost("/index/api/delStreamProxy", body);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM delStreamProxy 响应失败");
        }
    }

    // ==================== GB28181 点播 ====================

    /**
     * 打开 GB28181 RTP 接收端口。
     * 参考 ZLMediaKit 官方接口：/index/api/openRtpServer
     *
     * @param port     指定端口，0 表示随机分配
     * @param tcpMode  0=UDP，1=TCP 被动，2=TCP 主动
     * @param streamId 绑定到该端口的流 ID
     */
    public ZlmOpenRtpServerResponse openRtpServer(int port, int tcpMode, String streamId) {
        Map<String, Object> body = new HashMap<>();
        body.put("port", port);
        body.put("tcp_mode", tcpMode);
        body.put("stream_id", streamId);
        String json = doPost("/index/api/openRtpServer", body);
        try {
            return objectMapper.readValue(json, ZlmOpenRtpServerResponse.class);
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM openRtpServer 响应失败");
        }
    }

    /**
     * 关闭 GB28181 RTP 接收端口。
     * 参考 ZLMediaKit 官方接口：/index/api/closeRtpServer
     */
    public ZlmResponse<Map<String, Object>> closeRtpServer(String streamId) {
        Map<String, String> params = new HashMap<>();
        params.put("stream_id", streamId);
        String json = doGet("/index/api/closeRtpServer", params);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM closeRtpServer 响应失败");
        }
    }

    /**
     * GB28181 实时点播 (通过 ZLM 内置的 GB28181 模块)
     * 需要 ZLMediaKit 开启 GB28181 模块
     * POST /index/api/startSendRtp
     *
     * @param app       应用名
     * @param stream    流ID (通常为 channelId)
     * @param ssrc      SSRC
     * @param dstUrl    目标地址
     * @param dstPort   目标端口
     * @param isUdp     是否 UDP
     */
    public ZlmResponse<Map<String, Object>> startSendRtp(String app, String stream,
                                                          String ssrc, String dstUrl, int dstPort, boolean isUdp) {
        Map<String, Object> body = new HashMap<>();
        body.put("vhost", DEFAULT_VHOST);
        body.put("app", app);
        body.put("stream", stream);
        body.put("ssrc", ssrc);
        body.put("dst_url", dstUrl);
        body.put("dst_port", dstPort);
        body.put("is_udp", isUdp ? 1 : 0);
        String json = doPost("/index/api/startSendRtp", body);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM startSendRtp 响应失败");
        }
    }

    /**
     * 停止 RTP 推流
     * POST /index/api/stopSendRtp
     */
    public ZlmResponse<Map<String, Object>> stopSendRtp(String app, String stream) {
        Map<String, Object> body = new HashMap<>();
        body.put("vhost", DEFAULT_VHOST);
        body.put("app", app);
        body.put("stream", stream);
        String json = doPost("/index/api/stopSendRtp", body);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM stopSendRtp 响应失败");
        }
    }

    // ==================== 媒体流查询 ====================

    /**
     * 获取媒体列表
     * GET /index/api/getMediaList
     */
    public ZlmResponse<List<ZlmStreamInfo>> getMediaList(String app, String stream, String schema) {
        Map<String, String> params = new HashMap<>();
        if (app != null) params.put("app", app);
        if (stream != null) params.put("stream", stream);
        if (schema != null) params.put("schema", schema);
        params.put("vhost", DEFAULT_VHOST);
        String json = doGet("/index/api/getMediaList", params);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM getMediaList 响应失败");
        }
    }

    /**
     * 关闭媒体流
     * GET /index/api/close_stream
     */
    public ZlmResponse<Map<String, Object>> closeStream(String app, String stream, String schema) {
        Map<String, String> params = new HashMap<>();
        params.put("vhost", DEFAULT_VHOST);
        params.put("app", app);
        params.put("stream", stream);
        if (schema != null) params.put("schema", schema);
        params.put("force", "1");
        String json = doGet("/index/api/close_stream", params);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM close_stream 响应失败");
        }
    }

    // ==================== 截图 ====================

    /**
     * 获取截图
     * GET /index/api/getSnap
     *
     * @param url      流地址 (如 rtsp://...)
     * @param timeout  超时秒数
     * @param expireSec 截图缓存过期时间
     * @return 截图二进制 URL 或 base64
     */
    public byte[] getSnap(String url, int timeout, int expireSec) {
        StringBuilder reqUrl = new StringBuilder(zlmProperties.getApiUrl() + "/index/api/getSnap");
        reqUrl.append("?secret=").append(zlmProperties.getSecret());
        reqUrl.append("&url=").append(url);
        reqUrl.append("&timeout_sec=").append(timeout);
        reqUrl.append("&expire_sec=").append(expireSec);
        try {
            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(reqUrl.toString()))
                    .timeout(Duration.ofSeconds(timeout + 5))
                    .GET()
                    .build();
            HttpResponse<byte[]> response = HTTP_CLIENT.send(request, HttpResponse.BodyHandlers.ofByteArray());
            if (response.statusCode() == 200) {
                return response.body();
            }
            log.warn("ZLM getSnap failed: status={}", response.statusCode());
            return null;
        } catch (IOException | InterruptedException e) {
            log.error("ZLM getSnap error: {}", e.getMessage());
            if (e instanceof InterruptedException) {
                Thread.currentThread().interrupt();
            }
            return null;
        }
    }

    // ==================== 录像控制 ====================

    /**
     * 开始录像
     * GET /index/api/startRecord
     */
    public ZlmResponse<Map<String, Object>> startRecord(String app, String stream, int type) {
        Map<String, String> params = new HashMap<>();
        params.put("vhost", DEFAULT_VHOST);
        params.put("app", app);
        params.put("stream", stream);
        params.put("type", String.valueOf(type));
        String json = doGet("/index/api/startRecord", params);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM startRecord 响应失败");
        }
    }

    /**
     * 停止录像
     * GET /index/api/stopRecord
     */
    public ZlmResponse<Map<String, Object>> stopRecord(String app, String stream, int type) {
        Map<String, String> params = new HashMap<>();
        params.put("vhost", DEFAULT_VHOST);
        params.put("app", app);
        params.put("stream", stream);
        params.put("type", String.valueOf(type));
        String json = doGet("/index/api/stopRecord", params);
        try {
            return objectMapper.readValue(json, new TypeReference<>() {});
        } catch (JsonProcessingException e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "解析 ZLM stopRecord 响应失败");
        }
    }

    // ==================== 播放地址构建 ====================

    /**
     * 构建 FLV 播放地址
     */
    public String buildFlvUrl(String app, String stream) {
        return zlmProperties.getPlayBaseUrl() + "/" + app + "/" + stream + ".live.flv";
    }

    /**
     * 构建 HLS 播放地址
     */
    public String buildHlsUrl(String app, String stream) {
        return zlmProperties.getPlayBaseUrl() + "/" + app + "/" + stream + "/hls.m3u8";
    }

    /**
     * 构建 WebRTC 播放地址
     */
    public String buildWebrtcUrl(String app, String stream) {
        return zlmProperties.getPlayBaseUrl() + "/index/api/webrtc?app=" + app + "&stream=" + stream
                + "&type=play&secret=" + zlmProperties.getSecret();
    }

    /**
     * 构建 RTSP 地址 (用于内部拉流)
     */
    public String buildRtspUrl(String app, String stream) {
        return "rtsp://" + zlmProperties.getHost() + ":" + zlmProperties.getRtspPort() + "/" + app + "/" + stream;
    }
}
