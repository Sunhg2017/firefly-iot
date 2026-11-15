package com.songhg.firefly.iot.common.message;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.io.Serializable;

/**
 * 下行消息投递回执：connector 成功把下行消息投递给设备后发布到
 * {@link KafkaTopics#DEVICE_MESSAGE_DOWN_ACK}，firefly-device 据此把
 * {@code downlink_outbox} 中的对应记录标记为 DELIVERED，结束重试。
 */
@Data
@NoArgsConstructor
@AllArgsConstructor
public class DownlinkAck implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long deviceId;
    private String messageId;
}
