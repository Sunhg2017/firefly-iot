package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.songhg.firefly.iot.api.client.ProductClient;
import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

@Service
@RequiredArgsConstructor
public class TcpUdpBindingService {

    private final ProductClient productClient;
    private final TcpServer tcpServer;
    private final UdpServer udpServer;

    public TcpSessionInfo bindTcpSession(String sessionId, TcpUdpBindingRequest request) {
        TcpSessionInfo sessionInfo = tcpServer.getSession(sessionId);
        if (sessionInfo == null) {
            throw new BizException(ResultCode.NOT_FOUND, "TCP 会话不存在: " + sessionId);
        }
        sessionInfo.setBinding(resolveBinding(request));
        return sessionInfo;
    }

    public TcpSessionInfo unbindTcpSession(String sessionId) {
        TcpSessionInfo sessionInfo = tcpServer.getSession(sessionId);
        if (sessionInfo == null) {
            throw new BizException(ResultCode.NOT_FOUND, "TCP 会话不存在: " + sessionId);
        }
        sessionInfo.setBinding(null);
        return sessionInfo;
    }

    public UdpServer.UdpPeerInfo bindUdpPeer(TcpUdpBindingRequest request) {
        String address = trimToNull(request == null ? null : request.getAddress());
        Integer port = request == null ? null : request.getPort();
        if (address == null || port == null || port <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "UDP 绑定需要提供 address 和 port");
        }
        UdpServer.UdpPeerInfo peerInfo = udpServer.getPeer(address, port);
        if (peerInfo == null) {
            throw new BizException(ResultCode.NOT_FOUND, "UDP 对端不存在: " + address + ":" + port);
        }
        peerInfo.setBinding(resolveBinding(request));
        return peerInfo;
    }

    public UdpServer.UdpPeerInfo unbindUdpPeer(String address, Integer port) {
        String normalizedAddress = trimToNull(address);
        if (normalizedAddress == null || port == null || port <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "UDP 解绑需要提供 address 和 port");
        }
        UdpServer.UdpPeerInfo peerInfo = udpServer.getPeer(normalizedAddress, port);
        if (peerInfo == null) {
            throw new BizException(ResultCode.NOT_FOUND, "UDP 对端不存在: " + normalizedAddress + ":" + port);
        }
        peerInfo.setBinding(null);
        return peerInfo;
    }

    private TcpUdpBindingContext resolveBinding(TcpUdpBindingRequest request) {
        if (request == null || request.getProductId() == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "productId 不能为空");
        }
        ProductBasicVO product = loadProduct(request.getProductId());
        String requestProductKey = trimToNull(request.getProductKey());
        if (requestProductKey != null && !requestProductKey.equals(product.getProductKey())) {
            throw new BizException(ResultCode.CONFLICT, "productKey 与 productId 不匹配");
        }
        if (request.getTenantId() != null
                && product.getTenantId() != null
                && !request.getTenantId().equals(product.getTenantId())) {
            throw new BizException(ResultCode.CONFLICT, "tenantId 与 productId 不匹配");
        }

        return TcpUdpBindingContext.builder()
                .tenantId(request.getTenantId() != null ? request.getTenantId() : product.getTenantId())
                .productId(product.getId())
                .productKey(requestProductKey != null ? requestProductKey : product.getProductKey())
                .deviceId(request.getDeviceId())
                .deviceName(trimToNull(request.getDeviceName()))
                .bindTime(System.currentTimeMillis())
                .build();
    }

    private ProductBasicVO loadProduct(Long productId) {
        try {
            R<ProductBasicVO> response = productClient.getProductBasic(productId);
            ProductBasicVO product = response == null ? null : response.getData();
            if (product == null || product.getId() == null) {
                throw new BizException(ResultCode.PRODUCT_NOT_FOUND);
            }
            return product;
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "加载产品信息失败: " + ex.getMessage());
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
