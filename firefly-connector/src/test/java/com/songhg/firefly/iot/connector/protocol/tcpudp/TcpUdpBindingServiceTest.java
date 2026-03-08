package com.songhg.firefly.iot.connector.protocol.tcpudp;

import com.songhg.firefly.iot.api.client.ProductClient;
import com.songhg.firefly.iot.api.dto.ProductBasicVO;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class TcpUdpBindingServiceTest {

    @Mock
    private ProductClient productClient;

    @Mock
    private TcpServer tcpServer;

    @Mock
    private UdpServer udpServer;

    private TcpUdpBindingService tcpUdpBindingService;

    @BeforeEach
    void setUp() {
        tcpUdpBindingService = new TcpUdpBindingService(productClient, tcpServer, udpServer);
    }

    @Test
    void bindTcpSessionShouldBackfillProductContext() {
        TcpSessionInfo sessionInfo = new TcpSessionInfo();
        sessionInfo.setSessionId("tcp-session-1");
        when(tcpServer.getSession("tcp-session-1")).thenReturn(sessionInfo);

        ProductBasicVO product = new ProductBasicVO();
        product.setId(2001L);
        product.setTenantId(1001L);
        product.setProductKey("pk-demo");
        when(productClient.getProductBasic(2001L)).thenReturn(R.ok(product));

        TcpUdpBindingRequest request = new TcpUdpBindingRequest();
        request.setProductId(2001L);
        request.setDeviceId(3001L);
        request.setDeviceName("device-001");

        TcpSessionInfo bound = tcpUdpBindingService.bindTcpSession("tcp-session-1", request);

        assertThat(bound.getBinding()).isNotNull();
        assertThat(bound.getBinding().getTenantId()).isEqualTo(1001L);
        assertThat(bound.getBinding().getProductId()).isEqualTo(2001L);
        assertThat(bound.getBinding().getProductKey()).isEqualTo("pk-demo");
        assertThat(bound.getBinding().getDeviceId()).isEqualTo(3001L);
        assertThat(bound.getBinding().getDeviceName()).isEqualTo("device-001");
        assertThat(bound.getBinding().getBindTime()).isPositive();
    }

    @Test
    void bindTcpSessionShouldRejectProductMismatch() {
        TcpSessionInfo sessionInfo = new TcpSessionInfo();
        sessionInfo.setSessionId("tcp-session-1");
        when(tcpServer.getSession("tcp-session-1")).thenReturn(sessionInfo);

        ProductBasicVO product = new ProductBasicVO();
        product.setId(2001L);
        product.setTenantId(1001L);
        product.setProductKey("pk-demo");
        when(productClient.getProductBasic(2001L)).thenReturn(R.ok(product));

        TcpUdpBindingRequest request = new TcpUdpBindingRequest();
        request.setProductId(2001L);
        request.setProductKey("pk-other");

        assertThatThrownBy(() -> tcpUdpBindingService.bindTcpSession("tcp-session-1", request))
                .isInstanceOf(BizException.class)
                .hasMessageContaining("productKey");
    }
}
