package com.songhg.firefly.iot.media.zlm;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ZlmResponseTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void shouldTreatZeroCodeAsSuccess() throws Exception {
        ZlmResponse<Object> response = objectMapper.readValue(
                """
                        {"code":0,"msg":"success"}
                        """,
                objectMapper.getTypeFactory().constructParametricType(ZlmResponse.class, Object.class)
        );

        assertTrue(response.isSuccess());
    }

    @Test
    void shouldTreatMissingCodeAsFailure() throws Exception {
        ZlmResponse<Object> response = objectMapper.readValue(
                """
                        {"status":404,"error":"Not Found"}
                        """,
                objectMapper.getTypeFactory().constructParametricType(ZlmResponse.class, Object.class)
        );

        assertFalse(response.isSuccess());
    }
}
