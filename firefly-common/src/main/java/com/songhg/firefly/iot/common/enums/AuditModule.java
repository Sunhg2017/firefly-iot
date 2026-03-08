package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 审计模块枚举。
 */
@Getter
@AllArgsConstructor
public enum AuditModule implements IEnum {

    TENANT("TENANT", "租户管理"),
    USER("USER", "用户管理"),
    ROLE("ROLE", "角色权限"),
    PROJECT("PROJECT", "项目管理"),
    PRODUCT("PRODUCT", "产品管理"),
    DEVICE("DEVICE", "设备管理"),
    RULE_ENGINE("RULE_ENGINE", "规则引擎"),
    ALARM("ALARM", "告警管理"),
    OTA("OTA", "OTA 升级"),
    VIDEO("VIDEO", "视频监控"),
    FILE("FILE", "文件管理"),
    API_KEY("API_KEY", "API 密钥"),
    SYSTEM("SYSTEM", "系统设置"),
    AUTH("AUTH", "认证授权");

    @EnumValue
    @JsonValue
    private final String code;
    private final String desc;

    @Override
    public Object getValue() {
        return this.code;
    }

    @Override
    public String getDescription() {
        return this.desc;
    }
}
