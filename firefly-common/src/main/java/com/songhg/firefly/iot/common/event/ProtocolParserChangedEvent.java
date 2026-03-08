package com.songhg.firefly.iot.common.event;

import lombok.Data;
import lombok.EqualsAndHashCode;

@Data
@EqualsAndHashCode(callSuper = true)
public class ProtocolParserChangedEvent extends DomainEvent {

    public enum Action {
        PUBLISHED,
        ROLLED_BACK,
        ENABLED,
        DISABLED
    }

    private Action action;
    private Long productId;
    private Long definitionId;
    private Integer publishedVersion;

    public ProtocolParserChangedEvent() {
        super();
    }

    public static ProtocolParserChangedEvent of(Long tenantId,
                                                Long operatorId,
                                                Long productId,
                                                Long definitionId,
                                                Integer publishedVersion,
                                                Action action) {
        ProtocolParserChangedEvent event = new ProtocolParserChangedEvent();
        event.setTenantId(tenantId);
        event.setOperatorId(operatorId);
        event.setProductId(productId);
        event.setDefinitionId(definitionId);
        event.setPublishedVersion(publishedVersion);
        event.setAction(action);
        event.setSource("firefly-device");
        return event;
    }
}
