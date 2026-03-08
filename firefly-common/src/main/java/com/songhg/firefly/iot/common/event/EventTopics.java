package com.songhg.firefly.iot.common.event;

/**
 * Kafka Topic 常量。所有领域事件的 Topic 集中定义。
 */
public final class EventTopics {

    private EventTopics() {
    }

    public static final String TENANT_EVENTS = "firefly.tenant.events";
    public static final String USER_EVENTS = "firefly.user.events";
    public static final String ROLE_EVENTS = "firefly.role.events";
    public static final String PERMISSION_EVENTS = "firefly.permission.events";
    public static final String AUTH_EVENTS = "firefly.auth.events";
    public static final String SESSION_EVENTS = "firefly.session.events";
    public static final String AUDIT_EVENTS = "firefly.audit.events";
    public static final String API_ACCESS_LOGS = "firefly.api.access.logs";
    public static final String PROTOCOL_PARSER_CHANGED = "protocol.parser.changed";
}
