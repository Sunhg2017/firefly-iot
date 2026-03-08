package com.songhg.firefly.iot.connector.parser.executor;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.github.benmanes.caffeine.cache.Cache;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParseExecutionResult;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class ScriptParserExecutorTest {

    private final ScriptParserExecutor scriptParserExecutor = new ScriptParserExecutor(new ObjectMapper());

    @AfterEach
    void tearDown() {
        scriptParserExecutor.shutdown();
    }

    @Test
    void executeShouldRefreshCachedSourceWhenDraftScriptChanges() {
        ParseContext context = buildContext();

        ParseExecutionResult first = scriptParserExecutor.execute(definition(
                11L,
                3,
                """
                        function parse(ctx) {
                          return {
                            messages: [{
                              type: 'PROPERTY_REPORT',
                              payload: {
                                value: hex.toBytes(ctx.payloadHex)[0]
                              }
                            }]
                          };
                        }
                        """
        ), context);

        ParseExecutionResult second = scriptParserExecutor.execute(definition(
                11L,
                3,
                """
                        function parse(ctx) {
                          return {
                            messages: [{
                              type: 'PROPERTY_REPORT',
                              payload: {
                                value: hex.toBytes(ctx.payloadHex)[1] + 40
                              }
                            }]
                          };
                        }
                        """
        ), context);

        assertThat(first.getMessages()).hasSize(1);
        assertThat(first.getMessages().get(0).getPayload()).containsEntry("value", 1);
        assertThat(second.getMessages()).hasSize(1);
        assertThat(second.getMessages().get(0).getPayload()).containsEntry("value", 42);
    }

    @Test
    void invalidateShouldRemoveCachedSourcesForDefinition() {
        scriptParserExecutor.execute(definition(
                12L,
                1,
                """
                        function parse(ctx) {
                          return { messages: [] };
                        }
                        """
        ), buildContext());

        Cache<?, ?> cache = (Cache<?, ?>) ReflectionTestUtils.getField(scriptParserExecutor, "scriptSourceCache");
        assertThat(cache).isNotNull();
        assertThat(cache.estimatedSize()).isEqualTo(1);

        scriptParserExecutor.invalidate(12L);

        assertThat(cache.estimatedSize()).isZero();
    }

    private ProtocolParserPublishedDTO definition(Long definitionId, Integer versionNo, String scriptContent) {
        ProtocolParserPublishedDTO definition = new ProtocolParserPublishedDTO();
        definition.setDefinitionId(definitionId);
        definition.setVersionNo(versionNo);
        definition.setParserMode("SCRIPT");
        definition.setScriptContent(scriptContent);
        definition.setTimeoutMs(5_000);
        return definition;
    }

    private ParseContext buildContext() {
        byte[] payload = new byte[] {1, 2};
        return ParseContext.builder()
                .protocol("MQTT")
                .transport("MQTT")
                .topic("/up/demo")
                .payload(payload)
                .payloadText(new String(payload, StandardCharsets.UTF_8))
                .payloadHex("0102")
                .headers(Map.of("x-test", "true"))
                .sessionId("session-1")
                .remoteAddress("127.0.0.1")
                .productId(1001L)
                .productKey("pk-demo")
                .config(Map.of("mode", "debug"))
                .build();
    }
}
