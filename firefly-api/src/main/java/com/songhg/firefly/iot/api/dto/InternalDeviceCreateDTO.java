package com.songhg.firefly.iot.api.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.io.Serial;
import java.io.Serializable;

/**
 * 内部设备创建请求。
 */
@Data
public class InternalDeviceCreateDTO implements Serializable {

    @Serial
    private static final long serialVersionUID = 1L;

    private static final String DEVICE_NAME_REGEX = "^[A-Za-z0-9][A-Za-z0-9:_.-]{1,63}$";

    @NotNull(message = "productId 不能为空")
    private Long productId;

    private Long projectId;

    @NotBlank(message = "deviceName 不能为空")
    @Size(max = 64)
    @Pattern(regexp = DEVICE_NAME_REGEX, message = "deviceName 格式不合法")
    private String deviceName;

    @Size(max = 256)
    private String nickname;

    private String description;
}
