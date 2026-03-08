package com.songhg.firefly.iot.common.enums;

/**
 * 通用枚举接口，所有业务枚举实现此接口以支持 MyBatis TypeHandler 自动转换。
 */
public interface IEnum<T> {

    /**
     * 存储到数据库的值
     */
    T getValue();

    /**
     * 前端展示的描述
     */
    default String getDescription() {
        return ((Enum<?>) this).name();
    }
}
