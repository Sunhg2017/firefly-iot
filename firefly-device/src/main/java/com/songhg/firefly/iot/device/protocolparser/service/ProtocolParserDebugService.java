package com.songhg.firefly.iot.device.protocolparser.service;

import com.songhg.firefly.iot.api.client.ProtocolParserDebugClient;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugRequestDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugResponseDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.entity.Product;
import com.songhg.firefly.iot.device.mapper.ProductMapper;
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
        ProtocolParserPublishedDTO definition = protocolParserService.getDebugDefinition(definitionId);
        Product product = productMapper.selectById(definition.getProductId());
        if (product == null) {
            throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
        }

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
                throw new BizException(ResultCode.INTERNAL_ERROR, "调试执行返回为空");
            }
            return response.getData();
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "调试执行调用 Connector 失败: " + ex.getMessage());
        }
    }
}
