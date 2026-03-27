package com.songhg.firefly.iot.media.zlm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ZlmResponse<T> {

    private Integer code;
    private String msg;
    private T data;

    public boolean isSuccess() {
        return Integer.valueOf(0).equals(code);
    }
}
