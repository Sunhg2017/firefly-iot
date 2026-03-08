package com.songhg.firefly.iot.common.context;

import lombok.Data;

import java.io.Serializable;
import java.util.Set;

@Data
public class UserContext implements Serializable {

    private static final long serialVersionUID = 1L;

    private Long userId;
    private String username;
    private Long tenantId;
    private String platform;
    private Set<String> roles;
    private Set<String> permissions;
}
