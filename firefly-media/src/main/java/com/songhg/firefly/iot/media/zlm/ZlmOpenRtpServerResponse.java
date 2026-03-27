package com.songhg.firefly.iot.media.zlm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.util.Map;

@Data
@EqualsAndHashCode(callSuper = true)
@JsonIgnoreProperties(ignoreUnknown = true)
public class ZlmOpenRtpServerResponse extends ZlmResponse<Map<String, Object>> {

    private Object port;

    public Object resolvePortValue() {
        if (port != null) {
            return port;
        }
        Map<String, Object> data = getData();
        return data == null ? null : data.get("port");
    }

    public Integer resolvePort() {
        Object portValue = resolvePortValue();
        if (portValue instanceof Number number) {
            return number.intValue();
        }
        if (portValue instanceof String text) {
            try {
                return Integer.parseInt(text.trim());
            } catch (NumberFormatException ex) {
                return null;
            }
        }
        return null;
    }
}
