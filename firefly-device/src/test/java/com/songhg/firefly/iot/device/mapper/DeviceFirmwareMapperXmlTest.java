package com.songhg.firefly.iot.device.mapper;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class DeviceFirmwareMapperXmlTest {

    @Test
    void selectBindingPageShouldNotReferenceMissingProductDeletedColumn() throws IOException {
        try (InputStream inputStream = getClass().getClassLoader()
                .getResourceAsStream("mapper/device/DeviceFirmwareMapper.xml")) {
            assertNotNull(inputStream);
            String xml = new String(inputStream.readAllBytes(), StandardCharsets.UTF_8);
            assertTrue(xml.contains("ON p.id = d.product_id"));
            assertFalse(xml.contains("p.deleted_at"));
        }
    }
}
