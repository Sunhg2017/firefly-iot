package com.songhg.firefly.iot.device.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ProductCategory;
import com.songhg.firefly.iot.common.enums.ProductStatus;
import com.songhg.firefly.iot.common.enums.ProtocolType;
import com.songhg.firefly.iot.device.dto.product.ProductCreateDTO;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductServiceTest {

    private final ProductMapper productMapper = mock(ProductMapper.class);
    private final FileClient fileClient = mock(FileClient.class);
    private final ObjectMapper objectMapper = new ObjectMapper();
    private final ThingModelBuiltinServiceSupport builtinServiceSupport =
            new ThingModelBuiltinServiceSupport(objectMapper);
    private final ProductService productService =
            new ProductService(productMapper, fileClient, objectMapper, builtinServiceSupport);

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void shouldInitializeBuiltinLifecycleServicesWhenCreatingProduct() throws Exception {
        AppContextHolder.setTenantId(10L);
        AppContextHolder.setUserId(20L);

        ProductCreateDTO dto = new ProductCreateDTO();
        dto.setName("环境监测终端");
        dto.setCategory(ProductCategory.SENSOR);
        dto.setProtocol(ProtocolType.MQTT);

        doAnswer(invocation -> {
            Product inserted = invocation.getArgument(0);
            inserted.setId(100L);
            return 1;
        }).when(productMapper).insert(any(Product.class));

        productService.createProduct(dto);

        ArgumentCaptor<Product> captor = ArgumentCaptor.forClass(Product.class);
        verify(productMapper).insert(captor.capture());
        Product inserted = captor.getValue();

        JsonNode root = objectMapper.readTree(inserted.getThingModel());
        List<String> identifiers = extractServiceIdentifiers(root);
        assertEquals(List.of("online", "offline", "heartbeat"), identifiers);
    }

    @Test
    void shouldBackfillBuiltinLifecycleServicesForLegacyThingModel() throws Exception {
        Product product = new Product();
        product.setId(1L);
        product.setThingModel("{\"properties\":[],\"events\":[],\"services\":[]}");

        when(productMapper.selectById(1L)).thenReturn(product);

        String thingModel = productService.getThingModel(1L);

        JsonNode root = objectMapper.readTree(thingModel);
        assertEquals(List.of("online", "offline", "heartbeat"), extractServiceIdentifiers(root));
    }

    @Test
    void shouldKeepBuiltinLifecycleServicesWhenUpdatingThingModel() throws Exception {
        Product product = new Product();
        product.setId(1L);
        product.setStatus(ProductStatus.DEVELOPMENT);
        product.setThingModel("{\"properties\":[],\"events\":[],\"services\":[]}");

        when(productMapper.selectById(1L)).thenReturn(product);

        productService.updateThingModel(
                1L,
                "{\"properties\":[],\"events\":[],\"services\":[{\"identifier\":\"reboot\",\"name\":\"重启设备\"},{\"identifier\":\"online\",\"name\":\"自定义上线\"}]}"
        );

        JsonNode root = objectMapper.readTree(product.getThingModel());
        List<String> identifiers = extractServiceIdentifiers(root);
        assertEquals(List.of("online", "offline", "heartbeat", "reboot"), identifiers);
        assertTrue(root.path("services").get(0).path("system").asBoolean(false));
    }

    private List<String> extractServiceIdentifiers(JsonNode root) {
        return root.path("services")
                .findValuesAsText("identifier");
    }
}
