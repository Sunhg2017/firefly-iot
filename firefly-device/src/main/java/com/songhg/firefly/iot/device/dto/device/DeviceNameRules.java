package com.songhg.firefly.iot.device.dto.device;

public final class DeviceNameRules {

    public static final String REGEX = "^[A-Za-z0-9][A-Za-z0-9:_.-]{1,63}$";
    public static final String MESSAGE = "设备名称支持 2-64 位字母、数字、冒号、下划线、中划线、小数点，且需以字母或数字开头";

    private DeviceNameRules() {
    }
}
