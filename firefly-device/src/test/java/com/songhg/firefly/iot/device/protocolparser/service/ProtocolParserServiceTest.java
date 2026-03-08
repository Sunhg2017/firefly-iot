package com.songhg.firefly.iot.device.protocolparser.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.context.TenantContext;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContext;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.ProtocolParserChangedEvent;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserDefinition;
import com.songhg.firefly.iot.device.protocolparser.entity.ProtocolParserVersion;
import com.songhg.firefly.iot.device.protocolparser.mapper.ProtocolParserDefinitionMapper;
import com.songhg.firefly.iot.device.protocolparser.mapper.ProtocolParserVersionMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class ProtocolParserServiceTest {

    @Mock
    private ProtocolParserDefinitionMapper definitionMapper;

    @Mock
    private ProtocolParserVersionMapper versionMapper;

    @Mock
    private ProductMapper productMapper;

    @Mock
    private EventPublisher eventPublisher;

    private final ObjectMapper objectMapper = new ObjectMapper();

    private ProtocolParserService protocolParserService;

    @BeforeEach
    void setUp() {
        protocolParserService = new ProtocolParserService(
                definitionMapper,
                versionMapper,
                productMapper,
                objectMapper,
                eventPublisher
        );

        TenantContext tenantContext = new TenantContext();
        tenantContext.setTenantId(88L);
        TenantContextHolder.set(tenantContext);

        UserContext userContext = new UserContext();
        userContext.setUserId(501L);
        userContext.setTenantId(88L);
        UserContextHolder.set(userContext);
    }

    @AfterEach
    void tearDown() {
        TenantContextHolder.clear();
        UserContextHolder.clear();
    }

    @Test
    void publishShouldPersistSnapshotAndEmitChangedEvent() {
        ProtocolParserDefinition definition = baseDefinition();
        definition.setId(10L);
        definition.setCurrentVersion(3);
        definition.setStatus("DRAFT");

        when(definitionMapper.selectById(10L)).thenReturn(definition);
        when(versionMapper.selectByDefinitionIdAndVersionNo(10L, 3)).thenReturn(null);

        protocolParserService.publish(10L, "initial publish");

        ArgumentCaptor<ProtocolParserVersion> versionCaptor = ArgumentCaptor.forClass(ProtocolParserVersion.class);
        verify(versionMapper).insert(versionCaptor.capture());
        ProtocolParserVersion insertedVersion = versionCaptor.getValue();
        assertThat(insertedVersion.getDefinitionId()).isEqualTo(10L);
        assertThat(insertedVersion.getVersionNo()).isEqualTo(3);
        assertThat(insertedVersion.getPublishStatus()).isEqualTo("PUBLISHED");
        assertThat(insertedVersion.getChangeLog()).isEqualTo("initial publish");
        assertThat(insertedVersion.getCreatedBy()).isEqualTo(501L);
        assertThat(insertedVersion.getSnapshotJson()).contains("\"versionNo\":3");
        assertThat(insertedVersion.getSnapshotJson()).contains("\"status\":\"ENABLED\"");

        ArgumentCaptor<ProtocolParserDefinition> definitionCaptor =
                ArgumentCaptor.forClass(ProtocolParserDefinition.class);
        verify(definitionMapper).updateById(definitionCaptor.capture());
        ProtocolParserDefinition updatedDefinition = definitionCaptor.getValue();
        assertThat(updatedDefinition.getPublishedVersion()).isEqualTo(3);
        assertThat(updatedDefinition.getStatus()).isEqualTo("ENABLED");

        ArgumentCaptor<ProtocolParserChangedEvent> eventCaptor =
                ArgumentCaptor.forClass(ProtocolParserChangedEvent.class);
        verify(eventPublisher).publish(eq(EventTopics.PROTOCOL_PARSER_CHANGED), eq("1001"), eventCaptor.capture());
        ProtocolParserChangedEvent event = eventCaptor.getValue();
        assertThat(event.getAction()).isEqualTo(ProtocolParserChangedEvent.Action.PUBLISHED);
        assertThat(event.getTenantId()).isEqualTo(88L);
        assertThat(event.getOperatorId()).isEqualTo(501L);
        assertThat(event.getProductId()).isEqualTo(1001L);
        assertThat(event.getDefinitionId()).isEqualTo(10L);
        assertThat(event.getPublishedVersion()).isEqualTo(3);
    }

    @Test
    void rollbackShouldRestoreSnapshotAndAdvanceDraftVersion() throws Exception {
        ProtocolParserDefinition definition = baseDefinition();
        definition.setId(10L);
        definition.setCurrentVersion(5);
        definition.setPublishedVersion(4);
        definition.setStatus("ENABLED");
        definition.setProtocol("MQTT");
        definition.setTransport("MQTT");

        ProtocolParserPublishedDTO snapshot = new ProtocolParserPublishedDTO();
        snapshot.setScopeType("PRODUCT");
        snapshot.setScopeId(1001L);
        snapshot.setProtocol("HTTP");
        snapshot.setTransport("HTTP");
        snapshot.setDirection("UPLINK");
        snapshot.setParserMode("SCRIPT");
        snapshot.setFrameMode("NONE");
        snapshot.setMatchRuleJson("{\"topicEquals\":\"/rollback\"}");
        snapshot.setFrameConfigJson("{}");
        snapshot.setParserConfigJson("{\"productId\":1001}");
        snapshot.setScriptLanguage("JS");
        snapshot.setScriptContent("function parse(ctx) { return { messages: [] }; }");
        snapshot.setTimeoutMs(80);
        snapshot.setErrorPolicy("ERROR");

        ProtocolParserVersion version = new ProtocolParserVersion();
        version.setDefinitionId(10L);
        version.setVersionNo(2);
        version.setSnapshotJson(objectMapper.writeValueAsString(snapshot));

        when(definitionMapper.selectById(10L)).thenReturn(definition);
        when(versionMapper.selectByDefinitionIdAndVersionNo(10L, 2)).thenReturn(version);
        when(versionMapper.selectMaxVersionNo(10L)).thenReturn(5);

        protocolParserService.rollback(10L, 2);

        ArgumentCaptor<ProtocolParserDefinition> definitionCaptor =
                ArgumentCaptor.forClass(ProtocolParserDefinition.class);
        verify(definitionMapper).updateById(definitionCaptor.capture());
        ProtocolParserDefinition updatedDefinition = definitionCaptor.getValue();
        assertThat(updatedDefinition.getProtocol()).isEqualTo("HTTP");
        assertThat(updatedDefinition.getTransport()).isEqualTo("HTTP");
        assertThat(updatedDefinition.getMatchRuleJson()).isEqualTo("{\"topicEquals\":\"/rollback\"}");
        assertThat(updatedDefinition.getScriptContent()).isEqualTo("function parse(ctx) { return { messages: [] }; }");
        assertThat(updatedDefinition.getTimeoutMs()).isEqualTo(80);
        assertThat(updatedDefinition.getPublishedVersion()).isEqualTo(2);
        assertThat(updatedDefinition.getCurrentVersion()).isEqualTo(6);
        assertThat(updatedDefinition.getStatus()).isEqualTo("ENABLED");

        ArgumentCaptor<ProtocolParserChangedEvent> eventCaptor =
                ArgumentCaptor.forClass(ProtocolParserChangedEvent.class);
        verify(eventPublisher).publish(eq(EventTopics.PROTOCOL_PARSER_CHANGED), eq("1001"), eventCaptor.capture());
        ProtocolParserChangedEvent event = eventCaptor.getValue();
        assertThat(event.getAction()).isEqualTo(ProtocolParserChangedEvent.Action.ROLLED_BACK);
        assertThat(event.getPublishedVersion()).isEqualTo(2);
        assertThat(event.getDefinitionId()).isEqualTo(10L);
    }

    private ProtocolParserDefinition baseDefinition() {
        ProtocolParserDefinition definition = new ProtocolParserDefinition();
        definition.setTenantId(88L);
        definition.setProductId(1001L);
        definition.setScopeType("PRODUCT");
        definition.setScopeId(1001L);
        definition.setProtocol("MQTT");
        definition.setTransport("MQTT");
        definition.setDirection("UPLINK");
        definition.setParserMode("SCRIPT");
        definition.setFrameMode("NONE");
        definition.setMatchRuleJson("{}");
        definition.setFrameConfigJson("{}");
        definition.setParserConfigJson("{}");
        definition.setScriptLanguage("JS");
        definition.setScriptContent("function parse(ctx) { return { messages: [] }; }");
        definition.setTimeoutMs(50);
        definition.setErrorPolicy("ERROR");
        definition.setCreatedBy(501L);
        return definition;
    }
}
