package com.songhg.firefly.iot.connector.parser.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import org.springframework.stereotype.Component;

import java.time.Duration;

@Component
public class FrameSessionBufferStore {

    private final Cache<String, byte[]> sessionBuffers = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(5))
            .maximumSize(10_000)
            .build();

    public byte[] get(String sessionKey) {
        return sessionKey == null ? null : sessionBuffers.getIfPresent(sessionKey);
    }

    public void put(String sessionKey, byte[] payload) {
        if (sessionKey == null) {
            return;
        }
        if (payload == null || payload.length == 0) {
            sessionBuffers.invalidate(sessionKey);
            return;
        }
        sessionBuffers.put(sessionKey, payload);
    }

    public void clear(String sessionKey) {
        if (sessionKey != null) {
            sessionBuffers.invalidate(sessionKey);
        }
    }
}
