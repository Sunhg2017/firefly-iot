package com.songhg.firefly.iot.device.protocolparser.service;

import com.songhg.firefly.iot.api.client.ProtocolParserDebugClient;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugRequestDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugResponseDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserEncodeRequestDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserEncodeResponseDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserEncodeTestRequestDTO;
import com.songhg.firefly.iot.device.protocolparser.dto.ProtocolParserTestRequestDTO;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class ProtocolParserDebugService {

    private final ProtocolParserService protocolParserService;
    private final ProductMapper productMapper;
    private final ProtocolParserDebugClient protocolParserDebugClient;

    public ProtocolParserDebugResponseDTO test(Long definitionId, ProtocolParserTestRequestDTO request) {
        ProtocolParserPublishedDTO definition = prepareDefinition(definitionId, request == null ? null : request.getProductId());
        Product product = requireProduct(definition.getProductId());

        ProtocolParserDebugRequestDTO debugRequest = new ProtocolParserDebugRequestDTO();
        debugRequest.setDefinition(definition);
        debugRequest.setProductKey(product.getProductKey());
        debugRequest.setProtocol(request == null ? null : request.getProtocol());
        debugRequest.setTransport(request == null ? null : request.getTransport());
        debugRequest.setTopic(request == null ? null : request.getTopic());
        debugRequest.setPayloadEncoding(request == null ? null : request.getPayloadEncoding());
        debugRequest.setPayload(request == null ? null : request.getPayload());
        debugRequest.setHeaders(request == null ? null : request.getHeaders());
        debugRequest.setSessionId(request == null ? null : request.getSessionId());
        debugRequest.setRemoteAddress(request == null ? null : request.getRemoteAddress());

        try {
            R<ProtocolParserDebugResponseDTO> response = protocolParserDebugClient.debug(debugRequest);
            if (response == null || response.getData() == null) {
                throw new BizException(ResultCode.INTERNAL_ERROR, "Debug execution returned empty response");
            }
            return response.getData();
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "Debug execution failed: " + ex.getMessage());
        }
    }

    public ProtocolParserEncodeResponseDTO encodeTest(Long definitionId, ProtocolParserEncodeTestRequestDTO request) {
        ProtocolParserPublishedDTO definition = prepareDefinition(definitionId, request == null ? null : request.getProductId());
        Product product = requireProduct(definition.getProductId());

        ProtocolParserEncodeRequestDTO encodeRequest = new ProtocolParserEncodeRequestDTO();
        encodeRequest.setDefinition(definition);
        encodeRequest.setProductKey(product.getProductKey());
        encodeRequest.setTopic(request == null ? null : request.getTopic());
        encodeRequest.setMessageType(request == null ? null : request.getMessageType());
        encodeRequest.setDeviceId(request == null ? null : request.getDeviceId());
        encodeRequest.setDeviceName(request == null ? null : request.getDeviceName());
        encodeRequest.setHeaders(request == null ? null : request.getHeaders());
        encodeRequest.setSessionId(request == null ? null : request.getSessionId());
        encodeRequest.setRemoteAddress(request == null ? null : request.getRemoteAddress());
        encodeRequest.setPayload(request == null ? null : request.getPayload());

        try {
            R<ProtocolParserEncodeResponseDTO> response = protocolParserDebugClient.debugEncode(encodeRequest);
            if (response == null || response.getData() == null) {
                throw new BizException(ResultCode.INTERNAL_ERROR, "Encode debug returned empty response");
            }
            return response.getData();
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "Encode debug failed: " + ex.getMessage());
        }
    }

    private ProtocolParserPublishedDTO prepareDefinition(Long definitionId, Long overrideProductId) {
        ProtocolParserPublishedDTO definition = protocolParserService.getDebugDefinition(definitionId);
        if (overrideProductId != null) {
            definition.setProductId(overrideProductId);
        }
        if (definition.getProductId() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "productId is required for debugging tenant-scope rules");
        }
        return definition;
    }

    private Product requireProduct(Long productId) {
        Product product = productMapper.selectByIdIgnoreTenant(productId);
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }
        return product;
    }
}
