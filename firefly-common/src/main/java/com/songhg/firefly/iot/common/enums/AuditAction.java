package com.songhg.firefly.iot.common.enums;

import com.baomidou.mybatisplus.annotation.EnumValue;
import com.fasterxml.jackson.annotation.JsonValue;
import lombok.AllArgsConstructor;
import lombok.Getter;

/**
 * 审计操作类型枚举。
 */
@Getter
@AllArgsConstructor
public enum AuditAction implements IEnum {

    CREATE("CREATE", "创建"),
    UPDATE("UPDATE", "更新"),
    DELETE("DELETE", "删除"),
    QUERY("QUERY", "查询"),
    IMPORT("IMPORT", "导入"),
    EXPORT("EXPORT", "导出"),
    ENABLE("ENABLE", "启用"),
    DISABLE("DISABLE", "禁用"),
    LOGIN("LOGIN", "登录"),
    LOGOUT("LOGOUT", "登出"),
    UPLOAD("UPLOAD", "上传"),
    DOWNLOAD("DOWNLOAD", "下载"),
    EXECUTE("EXECUTE", "执行"),
    APPROVE("APPROVE", "审批"),
    REJECT("REJECT", "驳回");

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
