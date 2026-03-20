package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.api.client.FileClient;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.DataFormat;
import com.songhg.firefly.iot.common.enums.DeviceAuthType;
import com.songhg.firefly.iot.common.enums.NodeType;
import com.songhg.firefly.iot.common.enums.ProductStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.ProductConvert;
import com.songhg.firefly.iot.device.dto.product.ProductCreateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductQueryDTO;
import com.songhg.firefly.iot.device.dto.product.ProductUpdateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductVO;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.security.SecureRandom;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProductService {

    private static final String CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final SecureRandom RANDOM = new SecureRandom();
    private static final long MAX_PRODUCT_IMAGE_SIZE = 5 * 1024 * 1024;

    private final ProductMapper productMapper;
    private final FileClient fileClient;
    private final ObjectMapper objectMapper;
    private final ThingModelBuiltinDefinitionSupport thingModelBuiltinDefinitionSupport;

    @Transactional
    public ProductVO createProduct(ProductCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        Product product = ProductConvert.INSTANCE.toEntity(dto);
        product.setTenantId(tenantId);
        product.setProductKey(generateProductKey());
        product.setProductSecret(generateProductSecret());
        product.setStatus(ProductStatus.DEVELOPMENT);
        product.setDeviceCount(0);
        product.setCreatedBy(userId);
        product.setThingModel(writeThingModel(thingModelBuiltinDefinitionSupport.createDefaultThingModel()));
        if (product.getNodeType() == null) {
            product.setNodeType(NodeType.DEVICE);
        }
        if (product.getDataFormat() == null) {
            product.setDataFormat(DataFormat.JSON);
        }
        normalizeProductFields(product);
        productMapper.insert(product);

        log.info("Product created: id={}, productKey={}, tenantId={}", product.getId(), product.getProductKey(), tenantId);
        return ProductConvert.INSTANCE.toVO(product);
    }

    public ProductVO getProductById(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return ProductConvert.INSTANCE.toVO(product);
    }

    public ProductBasicVO getProductBasic(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        ProductBasicVO basic = new ProductBasicVO();
        basic.setId(product.getId());
        basic.setProductKey(product.getProductKey());
        basic.setName(product.getName());
        basic.setNodeType(product.getNodeType() == null ? null : product.getNodeType().name());
        basic.setProtocol(product.getProtocol() == null ? null : product.getProtocol().name());
        basic.setTenantId(product.getTenantId());
        return basic;
    }

    @DataScope(projectColumn = "project_id", productColumn = "id", deviceColumn = "", groupColumn = "")
    public IPage<ProductVO> listProducts(ProductQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<Product> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<Product> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Product::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(Product::getName, query.getKeyword())
                    .or().like(Product::getProductKey, query.getKeyword())
                    .or().like(Product::getModel, query.getKeyword()));
        }
        if (query.getCategory() != null) {
            wrapper.eq(Product::getCategory, query.getCategory());
        }
        if (query.getProtocol() != null) {
            wrapper.eq(Product::getProtocol, query.getProtocol());
        }
        if (query.getStatus() != null) {
            wrapper.eq(Product::getStatus, query.getStatus());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(Product::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(Product::getCreatedAt);

        IPage<Product> result = productMapper.selectPage(page, wrapper);
        return result.convert(ProductConvert.INSTANCE::toVO);
    }

    @Transactional
    public ProductVO updateProduct(Long id, ProductUpdateDTO dto) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        ProductConvert.INSTANCE.updateEntity(dto, product);
        normalizeProductFields(product);
        productMapper.updateById(product);
        return ProductConvert.INSTANCE.toVO(product);
    }

    @Transactional
    public void publishProduct(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        if (product.getStatus() != ProductStatus.DEVELOPMENT) {
            throw new BizException(ResultCode.PRODUCT_STATUS_ERROR, "仅开发中的产品可以发布");
        }
        product.setStatus(ProductStatus.PUBLISHED);
        productMapper.updateById(product);
        log.info("Product published: id={}, productKey={}", id, product.getProductKey());
    }

    @Transactional
    public void deleteProduct(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        if (product.getStatus() == ProductStatus.PUBLISHED) {
            throw new BizException(ResultCode.PRODUCT_STATUS_ERROR, "已发布的产品不允许删除");
        }
        if (product.getDeviceCount() != null && product.getDeviceCount() > 0) {
            throw new BizException(ResultCode.PRODUCT_HAS_DEVICES);
        }
        productMapper.deleteById(id);
        log.info("Product deleted: id={}, productKey={}", id, product.getProductKey());
    }

    @Transactional
    public ProductVO updateThingModel(Long id, String thingModelJson) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }

        ObjectNode nextThingModel = parseThingModel(thingModelJson);
        if (product.getStatus() == ProductStatus.PUBLISHED) {
            ObjectNode currentThingModel = parseThingModel(product.getThingModel());
            validatePublishedThingModelChange(currentThingModel, nextThingModel);
        }

        product.setThingModel(writeThingModel(nextThingModel));
        productMapper.updateById(product);
        return ProductConvert.INSTANCE.toVO(product);
    }

    public String getThingModel(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return writeThingModel(parseThingModel(product.getThingModel()));
    }

    public String getThingModelByProductKeyForCurrentTenant(String productKey) {
        String normalizedProductKey = trimToNull(productKey);
        if (normalizedProductKey == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "productKey 涓嶈兘涓虹┖");
        }

        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED);
        }

        Product product = productMapper.selectOne(new LambdaQueryWrapper<Product>()
                .eq(Product::getTenantId, tenantId)
                .eq(Product::getProductKey, normalizedProductKey)
                .last("LIMIT 1"));
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return writeThingModel(parseThingModel(product.getThingModel()));
    }

    public String getThingModelByProductKey(String productKey) {
        String normalizedProductKey = trimToNull(productKey);
        if (normalizedProductKey == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "productKey 不能为空");
        }

        Product product = productMapper.selectByProductKeyIgnoreTenant(normalizedProductKey);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return writeThingModel(parseThingModel(product.getThingModel()));
    }

    public String getProductSecret(Long id) {
        Product product = productMapper.selectById(id);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        if (product.getDeviceAuthType() != DeviceAuthType.PRODUCT_SECRET) {
            throw new BizException(ResultCode.PRODUCT_STATUS_ERROR, "当前产品未启用一型一密认证，不支持查看 ProductSecret");
        }
        if (ensureProductSecret(product)) {
            productMapper.updateById(product);
        }
        return product.getProductSecret();
    }

    public Map<String, String> uploadProductImage(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "上传图片不能为空");
        }
        if (file.getSize() > MAX_PRODUCT_IMAGE_SIZE) {
            throw new BizException(ResultCode.PARAM_ERROR, "产品图片大小不能超过 5MB");
        }

        String contentType = file.getContentType();
        if (contentType == null || !contentType.toLowerCase(Locale.ROOT).startsWith("image/")) {
            throw new BizException(ResultCode.PARAM_ERROR, "仅支持上传图片文件");
        }

        String objectName = AppContextHolder.getTenantId()
                + "/product/"
                + UUID.randomUUID().toString().replace("-", "")
                + resolveImageExtension(file.getOriginalFilename(), contentType);
        try {
            Map<String, String> uploaded = fileClient.uploadBytes(objectName, contentType, file.getBytes()).getData();
            String url = uploaded == null ? null : uploaded.get("url");
            if (url == null || url.isBlank()) {
                throw new BizException(ResultCode.INTERNAL_ERROR, "产品图片上传失败");
            }
            return Map.of("url", url, "objectName", objectName);
        } catch (IOException ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "读取上传图片失败");
        }
    }

    private String generateProductKey() {
        return "pk_" + randomString(16);
    }

    private String generateProductSecret() {
        return "ps_" + randomString(32);
    }

    private String randomString(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(CHARS.charAt(RANDOM.nextInt(CHARS.length())));
        }
        return sb.toString();
    }

    private void normalizeProductFields(Product product) {
        product.setName(trimToNull(product.getName()));
        if (product.getName() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "产品名称不能为空");
        }
        product.setModel(trimToNull(product.getModel()));
        product.setImageUrl(trimToNull(product.getImageUrl()));
        product.setDescription(trimToNull(product.getDescription()));
        if (product.getDeviceAuthType() == null) {
            product.setDeviceAuthType(DeviceAuthType.PRODUCT_SECRET);
        }
        if (product.getDeviceAuthType() == DeviceAuthType.PRODUCT_SECRET) {
            ensureProductSecret(product);
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private String resolveImageExtension(String originalName, String contentType) {
        if (originalName != null) {
            int index = originalName.lastIndexOf('.');
            if (index >= 0) {
                String ext = originalName.substring(index).toLowerCase(Locale.ROOT);
                if (ext.matches("\\.(png|jpg|jpeg|webp|gif|bmp|svg)$")) {
                    return ext;
                }
            }
        }

        return switch (contentType.toLowerCase(Locale.ROOT)) {
            case "image/png" -> ".png";
            case "image/webp" -> ".webp";
            case "image/gif" -> ".gif";
            case "image/bmp" -> ".bmp";
            case "image/svg+xml" -> ".svg";
            default -> ".jpg";
        };
    }

    private boolean ensureProductSecret(Product product) {
        if (product.getProductSecret() == null || product.getProductSecret().isBlank()) {
            product.setProductSecret(generateProductSecret());
            return true;
        }
        return false;
    }

    private ObjectNode parseThingModel(String thingModelJson) {
        String source = thingModelJson;
        if (source == null || source.isBlank()) {
            return thingModelBuiltinDefinitionSupport.createDefaultThingModel();
        }

        JsonNode parsed;
        try {
            parsed = objectMapper.readTree(source);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "物模型 JSON 格式不合法");
        }

        if (!(parsed instanceof ObjectNode root)) {
            throw new BizException(ResultCode.PARAM_ERROR, "物模型根节点必须是 JSON 对象");
        }

        ensureThingModelArray(root, "properties");
        ensureThingModelArray(root, "events");
        ensureThingModelArray(root, "services");
        return thingModelBuiltinDefinitionSupport.ensureBuiltinDefinitions(root);
    }

    private void ensureThingModelArray(ObjectNode root, String fieldName) {
        JsonNode field = root.get(fieldName);
        if (field == null || field.isNull()) {
            root.set(fieldName, objectMapper.createArrayNode());
            return;
        }

        if (!field.isArray()) {
            throw new BizException(ResultCode.PARAM_ERROR, "物模型字段 " + fieldName + " 必须是数组");
        }
    }

    private void validatePublishedThingModelChange(ObjectNode currentRoot, ObjectNode nextRoot) {
        if (!hasSameExtraFields(currentRoot, nextRoot)) {
            throw new BizException(ResultCode.PRODUCT_STATUS_ERROR, "已发布产品的物模型仅允许新增属性、事件、服务，不能修改其他定义");
        }

        validatePublishedSectionAppendOnly(currentRoot, nextRoot, "properties", "属性");
        validatePublishedSectionAppendOnly(currentRoot, nextRoot, "events", "事件");
        validatePublishedSectionAppendOnly(currentRoot, nextRoot, "services", "服务");
    }

    private boolean hasSameExtraFields(ObjectNode currentRoot, ObjectNode nextRoot) {
        return stripThingModelSections(currentRoot).equals(stripThingModelSections(nextRoot));
    }

    private ObjectNode stripThingModelSections(ObjectNode source) {
        ObjectNode copy = source.deepCopy();
        copy.remove("properties");
        copy.remove("events");
        copy.remove("services");
        return copy;
    }

    private void validatePublishedSectionAppendOnly(
            ObjectNode currentRoot,
            ObjectNode nextRoot,
            String fieldName,
            String sectionLabel) {
        ArrayNode currentArray = (ArrayNode) currentRoot.get(fieldName);
        ArrayNode nextArray = (ArrayNode) nextRoot.get(fieldName);
        if (nextArray.size() < currentArray.size()) {
            throw new BizException(ResultCode.PRODUCT_STATUS_ERROR, "已发布产品不允许删除已有" + sectionLabel + "定义");
        }

        for (int i = 0; i < currentArray.size(); i++) {
            if (!currentArray.get(i).equals(nextArray.get(i))) {
                throw new BizException(
                        ResultCode.PRODUCT_STATUS_ERROR,
                        "已发布产品的物模型仅允许在末尾新增" + sectionLabel + "，不能修改、删除或重排已有定义");
            }
        }
    }

    private String writeThingModel(ObjectNode thingModel) {
        try {
            return objectMapper.writeValueAsString(thingModel);
        } catch (JsonProcessingException ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "物模型序列化失败");
        }
    }
}
