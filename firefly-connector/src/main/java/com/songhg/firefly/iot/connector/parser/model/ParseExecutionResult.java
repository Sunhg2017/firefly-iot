package com.songhg.firefly.iot.connector.parser.model;

import lombok.Data;

import java.util.List;

@Data
public class ParseExecutionResult {

    private boolean drop;
    private boolean needMoreData;
    private ParsedDeviceIdentity identity;
    private List<ParsedMessage> messages;
}
