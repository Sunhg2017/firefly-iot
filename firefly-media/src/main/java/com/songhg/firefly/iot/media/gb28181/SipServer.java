package com.songhg.firefly.iot.media.gb28181;

import com.songhg.firefly.iot.media.config.SipProperties;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.sip.*;
import javax.sip.address.AddressFactory;
import javax.sip.header.HeaderFactory;
import javax.sip.message.MessageFactory;
import javax.sip.message.Request;
import javax.sip.message.Response;
import java.util.Properties;
import java.util.TooManyListenersException;

/**
 * GB/T 28181 SIP 服务器
 * <p>
 * 基于 JAIN-SIP 实现 SIP UAS，负责：
 * 1. 接收设备 REGISTER 注册
 * 2. 发送 INVITE 点播请求
 * 3. 发送 MESSAGE 目录查询/PTZ 控制
 * 4. 发送 BYE 关闭流
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SipServer implements SipListener {

    private final SipProperties sipProperties;
    private final SipMessageHandler sipMessageHandler;

    private SipFactory sipFactory;
    private SipStack sipStack;
    private SipProvider sipProvider;
    private AddressFactory addressFactory;
    private HeaderFactory headerFactory;
    private MessageFactory messageFactory;

    @PostConstruct
    public void init() {
        try {
            sipFactory = SipFactory.getInstance();
            sipFactory.setPathName("gov.nist");

            Properties props = new Properties();
            props.setProperty("javax.sip.STACK_NAME", "firefly-gb28181");
            props.setProperty("javax.sip.IP_ADDRESS", sipProperties.getIp());
            props.setProperty("gov.nist.javax.sip.LOG_MESSAGE_CONTENT", "false");
            props.setProperty("gov.nist.javax.sip.TRACE_LEVEL", "0");
            props.setProperty("gov.nist.javax.sip.SERVER_LOG", "");
            props.setProperty("gov.nist.javax.sip.DEBUG_LOG", "");

            sipStack = sipFactory.createSipStack(props);
            addressFactory = sipFactory.createAddressFactory();
            headerFactory = sipFactory.createHeaderFactory();
            messageFactory = sipFactory.createMessageFactory();

            ListeningPoint lp = sipStack.createListeningPoint(
                    sipProperties.getIp(), sipProperties.getPort(), sipProperties.getTransport().toLowerCase());
            sipProvider = sipStack.createSipProvider(lp);
            sipProvider.addSipListener(this);

            log.info("GB28181 SIP Server started: {}:{}/{}, domain={}, id={}",
                    sipProperties.getIp(), sipProperties.getPort(), sipProperties.getTransport(),
                    sipProperties.getDomain(), sipProperties.getId());
        } catch (Exception e) {
            log.error("GB28181 SIP Server init failed: {}", e.getMessage(), e);
        }
    }

    @PreDestroy
    public void destroy() {
        if (sipStack != null) {
            sipStack.stop();
            log.info("GB28181 SIP Server stopped");
        }
    }

    // ==================== SipListener ====================

    @Override
    public void processRequest(RequestEvent requestEvent) {
        Request request = requestEvent.getRequest();
        String method = request.getMethod();
        ServerTransaction serverTransaction = requestEvent.getServerTransaction();

        try {
            if (serverTransaction == null && sipProvider != null) {
                serverTransaction = sipProvider.getNewServerTransaction(request);
            }
        } catch (Exception e) {
            log.warn("Failed to create server transaction: {}", e.getMessage());
        }

        switch (method) {
            case Request.REGISTER:
                sipMessageHandler.handleRegister(requestEvent);
                sendOkResponse(request, serverTransaction, method);
                break;
            case Request.MESSAGE:
                sipMessageHandler.handleMessage(requestEvent);
                sendOkResponse(request, serverTransaction, method);
                break;
            case Request.BYE:
                sipMessageHandler.handleBye(requestEvent);
                sendOkResponse(request, serverTransaction, method);
                break;
            case Request.ACK:
                // ACK 不需要特殊处理
                break;
            default:
                log.debug("Unhandled SIP method: {}", method);
                try {
                    if (serverTransaction != null) {
                        Response response = messageFactory.createResponse(Response.OK, request);
                        serverTransaction.sendResponse(response);
                    }
                } catch (Exception e) {
                    log.error("Error sending default response: {}", e.getMessage());
                }
        }
    }

    @Override
    public void processResponse(ResponseEvent responseEvent) {
        sipMessageHandler.handleResponse(responseEvent);
    }

    @Override
    public void processTimeout(TimeoutEvent timeoutEvent) {
        log.warn("SIP timeout: {}", timeoutEvent);
    }

    @Override
    public void processIOException(IOExceptionEvent exceptionEvent) {
        log.error("SIP IO exception: host={}, port={}", exceptionEvent.getHost(), exceptionEvent.getPort());
    }

    @Override
    public void processTransactionTerminated(TransactionTerminatedEvent transactionTerminatedEvent) {
        // 事务终止，通常无需处理
    }

    @Override
    public void processDialogTerminated(DialogTerminatedEvent dialogTerminatedEvent) {
        // 对话终止
    }

    // ==================== Getters ====================

    public SipProvider getSipProvider() { return sipProvider; }
    public AddressFactory getAddressFactory() { return addressFactory; }
    public HeaderFactory getHeaderFactory() { return headerFactory; }
    public MessageFactory getMessageFactory() { return messageFactory; }

    /**
     * 当前 GB28181 服务端按无密码模式接收设备请求。
     * 对 REGISTER / MESSAGE / BYE 必须明确返回 200 OK，
     * 否则部分国标设备会把超时或无响应直接显示成“认证失败”。
     */
    private void sendOkResponse(Request request, ServerTransaction serverTransaction, String method) {
        if (serverTransaction == null || messageFactory == null) {
            log.warn("Skip SIP {} response because server transaction or messageFactory is unavailable", method);
            return;
        }
        try {
            Response response = messageFactory.createResponse(Response.OK, request);
            serverTransaction.sendResponse(response);
        } catch (Exception e) {
            log.error("Error sending SIP {} 200 OK response: {}", method, e.getMessage(), e);
        }
    }
}
