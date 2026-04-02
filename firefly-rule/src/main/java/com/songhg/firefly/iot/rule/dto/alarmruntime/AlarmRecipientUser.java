package com.songhg.firefly.iot.rule.dto.alarmruntime;

import lombok.Data;

@Data
public class AlarmRecipientUser {

    private Long userId;
    private String username;
    private String realName;
    private String phone;
    private String email;
}
