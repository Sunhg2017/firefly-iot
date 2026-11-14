package com.songhg.firefly.iot.rule.dataforward.executor;

import com.songhg.firefly.iot.common.enums.DataForwardTargetType;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.rule.dataforward.entity.DataForwardRule;

import java.util.Map;

/**
 * 数据流转目标执行器：把命中规则的设备消息转发到外部系统。
 * 每种目标类型（MQTT/AMQP/TSDB/WEBHOOK）对应一个实现。
 */
public interface DataForwardTargetExecutor {

    DataForwardTargetType type();

    void execute(DataForwardRule rule, DeviceMessage message, Map<String, Object> variables) throws Exception;
}
