package com.songhg.firefly.iot.media.controller;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.songhg.firefly.iot.common.enums.StreamStatus;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import com.songhg.firefly.iot.media.entity.StreamSession;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import com.songhg.firefly.iot.media.mapper.StreamSessionMapper;
import com.songhg.firefly.iot.media.mapper.VideoDeviceMapper;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.time.LocalDateTime;
import java.util.Map;

/**
 * ZLMediaKit Hook 回调控制器
 * <p>
 * ZLMediaKit 在以下事件发生时会回调此接口：
 * - on_server_started: 服务器启动
 * - on_publish: 推流鉴权
 * - on_play: 播放鉴权
 * - on_stream_changed: 流注册/注销
 * - on_stream_none_reader: 无人观看
 * - on_server_keepalive: 心跳
 * <p>
 * 配置 ZLMediaKit config.ini:
 * [hook]
 * enable=1
 * on_stream_changed=http://{platform_host}:8081/api/v1/video/hook/on_stream_changed
 * on_stream_none_reader=http://{platform_host}:8081/api/v1/video/hook/on_stream_none_reader
 * on_server_keepalive=http://{platform_host}:8081/api/v1/video/hook/on_server_keepalive
 */
@Slf4j
@Tag(name = "ZLMediaKit 回调", description = "ZLMediaKit Webhook 处理")
@RestController
@RequestMapping("/api/v1/video/hook")
@RequiredArgsConstructor
public class ZlmHookController {

    private final StreamSessionMapper streamSessionMapper;
    private final VideoDeviceMapper videoDeviceMapper;

    /**
     * 流变化回调 (注册/注销)
     * ZLMediaKit 在流注册或注销时调用
     */
    @PostMapping("/on_stream_changed")
    @Operation(summary = "流变化回调")
    public Map<String, Object> onStreamChanged(@RequestBody Map<String, Object> params) {
        boolean regist = Boolean.TRUE.equals(params.get("regist"));
        String app = (String) params.get("app");
        String stream = (String) params.get("stream");
        String schema = (String) params.get("schema");

        log.info("ZLM hook on_stream_changed: regist={}, app={}, stream={}, schema={}", regist, app, stream, schema);

        if ("rtsp".equals(schema)) {
            if (regist) {
                log.info("Stream registered: {}/{}", app, stream);
            } else {
                // 流注销 -> 关闭对应的流会话
                LambdaUpdateWrapper<StreamSession> wrapper = new LambdaUpdateWrapper<>();
                wrapper.eq(StreamSession::getStreamId, stream)
                        .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                        .set(StreamSession::getStatus, StreamStatus.CLOSED)
                        .set(StreamSession::getStoppedAt, LocalDateTime.now());
                streamSessionMapper.update(null, wrapper);
                log.info("Stream unregistered, session closed: {}/{}", app, stream);
            }
        }

        return Map.of("code", 0, "msg", "success");
    }

    /**
     * 无人观看回调
     * ZLMediaKit 在流无人观看超过阈值时调用
     * 返回 close=true 则自动关闭该流
     */
    @PostMapping("/on_stream_none_reader")
    @Operation(summary = "无人观看回调")
    public Map<String, Object> onStreamNoneReader(@RequestBody Map<String, Object> params) {
        String app = (String) params.get("app");
        String stream = (String) params.get("stream");
        String schema = (String) params.get("schema");

        log.info("ZLM hook on_stream_none_reader: app={}, stream={}, schema={}", app, stream, schema);

        // 对于 RTSP / RTMP 代理流，无人观看时自动关闭以节省资源
        // 对于 GB28181 流，保持不关闭（设备持续推流）
        boolean close = !"rtp".equals(app);

        if (close) {
            LambdaUpdateWrapper<StreamSession> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(StreamSession::getStreamId, stream)
                    .eq(StreamSession::getStatus, StreamStatus.ACTIVE)
                    .set(StreamSession::getStatus, StreamStatus.CLOSED)
                    .set(StreamSession::getStoppedAt, LocalDateTime.now());
            streamSessionMapper.update(null, wrapper);
        }

        return Map.of("code", 0, "close", close);
    }

    /**
     * 服务器心跳回调
     */
    @PostMapping("/on_server_keepalive")
    @Operation(summary = "服务心跳回调")
    public Map<String, Object> onServerKeepalive(@RequestBody Map<String, Object> params) {
        log.debug("ZLM hook on_server_keepalive: {}", params);
        return Map.of("code", 0, "msg", "success");
    }

    /**
     * 推流鉴权回调
     * 设备推流时 ZLMediaKit 调用此接口鉴权
     */
    @PostMapping("/on_publish")
    @Operation(summary = "推流鉴权回调")
    public Map<String, Object> onPublish(@RequestBody Map<String, Object> params) {
        String app = (String) params.get("app");
        String stream = (String) params.get("stream");
        String ip = (String) params.get("ip");

        log.info("ZLM hook on_publish: app={}, stream={}, ip={}", app, stream, ip);

        // 基础鉴权: 允许所有推流（生产环境应校验 token/设备合法性）
        return Map.of("code", 0, "msg", "success", "enable_hls", true, "enable_mp4", false);
    }

    /**
     * 播放鉴权回调
     */
    @PostMapping("/on_play")
    @Operation(summary = "播放鉴权回调")
    public Map<String, Object> onPlay(@RequestBody Map<String, Object> params) {
        String app = (String) params.get("app");
        String stream = (String) params.get("stream");
        String ip = (String) params.get("ip");

        log.info("ZLM hook on_play: app={}, stream={}, ip={}", app, stream, ip);

        // 基础鉴权: 允许所有播放（生产环境应校验 token/租户权限）
        return Map.of("code", 0, "msg", "success");
    }

    /**
     * GB28181 设备注册回调 (如果 ZLM 开启了 GB28181 模块)
     * 设备通过 SIP REGISTER 注册时回调
     */
    @PostMapping("/on_device_register")
    @Operation(summary = "GB28181 设备注册回调")
    public Map<String, Object> onDeviceRegister(@RequestBody Map<String, Object> params) {
        String deviceId = (String) params.get("deviceId");
        Boolean online = (Boolean) params.get("online");

        log.info("ZLM hook on_device_register: deviceId={}, online={}", deviceId, online);

        if (deviceId != null) {
            LambdaUpdateWrapper<VideoDevice> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(VideoDevice::getGbDeviceId, deviceId)
                    .set(VideoDevice::getStatus, Boolean.TRUE.equals(online) ? VideoDeviceStatus.ONLINE : VideoDeviceStatus.OFFLINE)
                    .set(Boolean.TRUE.equals(online), VideoDevice::getLastRegisteredAt, LocalDateTime.now());
            videoDeviceMapper.update(null, wrapper);
        }

        return Map.of("code", 0, "msg", "success");
    }
}
