package com.songhg.firefly.iot.connector.parser.service;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.songhg.firefly.iot.api.client.ProtocolParserClient;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.result.R;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.time.Duration;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class PublishedProtocolParserService {

    private final ProtocolParserClient protocolParserClient;

    private final Cache<Long, List<ProtocolParserPublishedDTO>> definitionCache = Caffeine.newBuilder()
            .expireAfterWrite(Duration.ofMinutes(10))
            .maximumSize(1_000)
            .build();

    public List<ProtocolParserPublishedDTO> getPublishedDefinitions(Long productId) {
        if (productId == null) {
            return List.of();
        }
        return definitionCache.get(productId, this::loadDefinitions);
    }

    public void invalidate(Long productId) {
        if (productId != null) {
            definitionCache.invalidate(productId);
        }
    }

    private List<ProtocolParserPublishedDTO> loadDefinitions(Long productId) {
        try {
            R<List<ProtocolParserPublishedDTO>> response = protocolParserClient.getPublishedByProductId(productId);
            if (response == null || response.getData() == null) {
                return List.of();
            }
            return response.getData();
        } catch (Exception ex) {
            log.warn("Load published protocol parsers failed: productId={}, error={}", productId, ex.getMessage());
            return List.of();
        }
    }
}
