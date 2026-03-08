package com.songhg.firefly.iot.connector.parser.model;

import com.songhg.firefly.iot.common.message.DeviceMessage;
import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class ProtocolParseOutcome {

    private boolean handled;
    private List<DeviceMessage> messages;

    public static ProtocolParseOutcome notHandled() {
        return ProtocolParseOutcome.builder()
                .handled(false)
                .messages(List.of())
                .build();
    }

    public static ProtocolParseOutcome handled(List<DeviceMessage> messages) {
        return ProtocolParseOutcome.builder()
                .handled(true)
                .messages(messages == null ? List.of() : messages)
                .build();
    }
}
