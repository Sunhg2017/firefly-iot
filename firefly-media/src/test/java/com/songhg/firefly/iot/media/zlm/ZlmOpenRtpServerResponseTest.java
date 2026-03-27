package com.songhg.firefly.iot.media.zlm;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

class ZlmOpenRtpServerResponseTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldReadTopLevelPortFromZlmResponse() throws Exception {
        ZlmOpenRtpServerResponse response = objectMapper.readValue(
                """
                        {"code":0,"msg":"success","port":30124}
                        """,
                ZlmOpenRtpServerResponse.class
        );

        assertEquals(30124, response.resolvePort());
    }

    @Test
    void shouldReadNestedStringPortFromZlmResponse() throws Exception {
        ZlmOpenRtpServerResponse response = objectMapper.readValue(
                """
                        {"code":0,"msg":"success","data":{"port":"30124"}}
                        """,
                ZlmOpenRtpServerResponse.class
        );

        assertEquals(30124, response.resolvePort());
    }

    @Test
    void shouldReturnNullWhenPortIsInvalid() throws Exception {
        ZlmOpenRtpServerResponse response = objectMapper.readValue(
                """
                        {"code":0,"msg":"success","port":"not-a-port"}
                        """,
                ZlmOpenRtpServerResponse.class
        );

        assertNull(response.resolvePort());
    }
}
