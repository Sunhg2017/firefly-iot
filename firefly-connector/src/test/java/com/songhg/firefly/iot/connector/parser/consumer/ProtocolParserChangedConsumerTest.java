package com.songhg.firefly.iot.connector.parser.consumer;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.connector.parser.executor.ScriptParserExecutor;
import com.songhg.firefly.iot.connector.parser.service.PublishedProtocolParserService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;

@ExtendWith(MockitoExtension.class)
class ProtocolParserChangedConsumerTest {

    @Mock
    private PublishedProtocolParserService publishedProtocolParserService;

    @Mock
    private ScriptParserExecutor scriptParserExecutor;

    private ProtocolParserChangedConsumer protocolParserChangedConsumer;

    @BeforeEach
    void setUp() {
        protocolParserChangedConsumer = new ProtocolParserChangedConsumer(
                new ObjectMapper(),
                publishedProtocolParserService,
                scriptParserExecutor
        );
    }

    @Test
    void onChangedShouldInvalidateDefinitionAndScriptCaches() {
        protocolParserChangedConsumer.onChanged("""
                {
                  "productId": 1001,
                  "definitionId": 2002,
                  "action": "PUBLISHED",
                  "publishedVersion": 3
                }
                """);

        verify(publishedProtocolParserService).invalidate(1001L);
        verify(scriptParserExecutor).invalidate(2002L);
    }

    @Test
    void onChangedShouldIgnoreEventsWithoutIdentifiers() {
        protocolParserChangedConsumer.onChanged("""
                {
                  "action": "DISABLED"
                }
                """);

        verifyNoInteractions(publishedProtocolParserService, scriptParserExecutor);
    }
}
