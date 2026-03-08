package com.songhg.firefly.iot.connector.parser.consumer;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.connector.parser.executor.ScriptParserExecutor;
import com.songhg.firefly.iot.connector.parser.service.PublishedProtocolParserService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.kafka.annotation.KafkaListener;
import org.springframework.stereotype.Component;

@Slf4j
@Component
@RequiredArgsConstructor
public class ProtocolParserChangedConsumer {

    private final ObjectMapper objectMapper;
    private final PublishedProtocolParserService publishedProtocolParserService;
    private final ScriptParserExecutor scriptParserExecutor;

    @KafkaListener(topics = EventTopics.PROTOCOL_PARSER_CHANGED, groupId = "firefly-connector-protocol-parser")
    public void onChanged(String message) {
        try {
            JsonNode node = objectMapper.readTree(message);
            long productId = node.path("productId").asLong(0L);
            long definitionId = node.path("definitionId").asLong(0L);
            boolean invalidated = false;
            if (productId > 0) {
                publishedProtocolParserService.invalidate(productId);
                invalidated = true;
            }
            if (definitionId > 0) {
                scriptParserExecutor.invalidate(definitionId);
                invalidated = true;
            }
            if (!invalidated) {
                log.warn("Ignore protocol parser change event without valid identifiers: {}", message);
                return;
            }
            log.info("Protocol parser cache invalidated: productId={}, definitionId={}, action={}, publishedVersion={}",
                    productId,
                    definitionId,
                    node.path("action").asText(),
                    node.path("publishedVersion").asInt(0));
        } catch (Exception ex) {
            log.warn("Failed to consume protocol parser changed event: {}", ex.getMessage());
        }
    }
}
