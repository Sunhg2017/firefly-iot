package com.songhg.firefly.iot.system.dto;

import lombok.Data;

@Data
public class AdminSessionTarget {

    private Long userId;

    private Long tenantId;

    private String username;
}
