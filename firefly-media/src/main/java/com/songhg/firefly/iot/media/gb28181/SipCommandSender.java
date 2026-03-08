package com.songhg.firefly.iot.media.gb28181;

import com.songhg.firefly.iot.common.enums.PtzCommand;
import com.songhg.firefly.iot.media.config.SipProperties;
import com.songhg.firefly.iot.media.config.ZlmProperties;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import javax.sip.address.Address;
import javax.sip.address.SipURI;
import javax.sip.header.*;
import javax.sip.message.Request;
import java.util.ArrayList;
import java.util.UUID;

/**
 * GB/T 28181 SIP 指令发送器
 * <p>
 * 负责构建并发送 SIP 请求：
 * - MESSAGE: 目录查询、PTZ 控制、设备信息查询
 * - INVITE: 实时点播、历史回放
 * - BYE: 停止播放
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SipCommandSender {

    private final SipServer sipServer;
    private final SipProperties sipProperties;
    private final ZlmProperties zlmProperties;

    /**
     * 发送目录查询 (Catalog)
     */
    public void queryCatalog(VideoDevice device) {
        String xml = "<?xml version=\"1.0\" encoding=\"GB2312\"?>\r\n"
                + "<Query>\r\n"
                + "<CmdType>Catalog</CmdType>\r\n"
                + "<SN>" + generateSn() + "</SN>\r\n"
                + "<DeviceID>" + device.getGbDeviceId() + "</DeviceID>\r\n"
                + "</Query>\r\n";

        sendMessage(device, xml);
        log.info("GB28181 Catalog query sent: deviceId={}", device.getGbDeviceId());
    }

    /**
     * 发送设备信息查询 (DeviceInfo)
     */
    public void queryDeviceInfo(VideoDevice device) {
        String xml = "<?xml version=\"1.0\" encoding=\"GB2312\"?>\r\n"
                + "<Query>\r\n"
                + "<CmdType>DeviceInfo</CmdType>\r\n"
                + "<SN>" + generateSn() + "</SN>\r\n"
                + "<DeviceID>" + device.getGbDeviceId() + "</DeviceID>\r\n"
                + "</Query>\r\n";

        sendMessage(device, xml);
        log.info("GB28181 DeviceInfo query sent: deviceId={}", device.getGbDeviceId());
    }

    /**
     * 发送 PTZ 控制指令
     */
    public void sendPtzControl(VideoDevice device, String channelId, PtzCommand command, int speed) {
        String ptzCmd = PtzCommandBuilder.build(command, speed);
        String targetChannelId = channelId != null ? channelId : device.getGbDeviceId();

        String xml = "<?xml version=\"1.0\" encoding=\"GB2312\"?>\r\n"
                + "<Control>\r\n"
                + "<CmdType>DeviceControl</CmdType>\r\n"
                + "<SN>" + generateSn() + "</SN>\r\n"
                + "<DeviceID>" + targetChannelId + "</DeviceID>\r\n"
                + "<PTZCmd>" + ptzCmd + "</PTZCmd>\r\n"
                + "</Control>\r\n";

        sendMessage(device, xml);
        log.info("GB28181 PTZ sent: deviceId={}, channelId={}, command={}, speed={}, ptzCmd={}",
                device.getGbDeviceId(), targetChannelId, command, speed, ptzCmd);
    }

    /**
     * 发送实时点播 INVITE
     *
     * @param device    视频设备
     * @param channelId 通道编号
     * @param ssrc      SSRC (10 位数字字符串)
     * @return 是否成功发送
     */
    public boolean sendInvite(VideoDevice device, String channelId, String ssrc) {
        try {
            String targetId = channelId != null ? channelId : device.getGbDeviceId();
            String rtpIp = zlmProperties.getHost();
            int rtpPort = zlmProperties.getRtpPort();

            // 构建 SDP
            String sdp = buildPlaySdp(targetId, rtpIp, rtpPort, ssrc);

            // 构建 INVITE 请求
            Request invite = buildRequest(device, Request.INVITE, sdp, "application/sdp");
            if (invite == null) return false;

            sipServer.getSipProvider().sendRequest(invite);
            log.info("GB28181 INVITE sent: deviceId={}, channelId={}, ssrc={}", device.getGbDeviceId(), targetId, ssrc);
            return true;
        } catch (Exception e) {
            log.error("GB28181 INVITE failed: {}", e.getMessage(), e);
            return false;
        }
    }

    /**
     * 发送 BYE 停止播放
     */
    public boolean sendBye(VideoDevice device, String channelId) {
        try {
            Request bye = buildRequest(device, Request.BYE, null, null);
            if (bye == null) return false;

            sipServer.getSipProvider().sendRequest(bye);
            log.info("GB28181 BYE sent: deviceId={}, channelId={}", device.getGbDeviceId(), channelId);
            return true;
        } catch (Exception e) {
            log.error("GB28181 BYE failed: {}", e.getMessage(), e);
            return false;
        }
    }

    // ==================== 内部方法 ====================

    /**
     * 发送 SIP MESSAGE
     */
    private void sendMessage(VideoDevice device, String xmlContent) {
        try {
            Request message = buildRequest(device, Request.MESSAGE, xmlContent, "Application/MANSCDP+xml");
            if (message == null) return;

            sipServer.getSipProvider().sendRequest(message);
        } catch (Exception e) {
            log.error("SIP MESSAGE send failed: deviceId={}, error={}", device.getGbDeviceId(), e.getMessage());
        }
    }

    /**
     * 构建 SIP 请求
     */
    private Request buildRequest(VideoDevice device, String method, String content, String contentType) {
        try {
            var af = sipServer.getAddressFactory();
            var hf = sipServer.getHeaderFactory();
            var mf = sipServer.getMessageFactory();

            if (af == null || hf == null || mf == null) {
                log.error("SIP factories not initialized");
                return null;
            }

            String deviceIp = device.getIp() != null ? device.getIp() : "127.0.0.1";
            int devicePort = device.getPort() != null ? device.getPort() : 5060;

            // Request-URI
            SipURI requestUri = af.createSipURI(device.getGbDeviceId(), deviceIp + ":" + devicePort);

            // Via
            var viaHeaders = new ArrayList<ViaHeader>();
            ViaHeader viaHeader = hf.createViaHeader(sipProperties.getIp(), sipProperties.getPort(),
                    sipProperties.getTransport().toLowerCase(), null);
            viaHeader.setRPort();
            viaHeaders.add(viaHeader);

            // From
            SipURI fromUri = af.createSipURI(sipProperties.getId(), sipProperties.getDomain());
            Address fromAddress = af.createAddress(fromUri);
            fromAddress.setDisplayName("Firefly-IoT");
            FromHeader fromHeader = hf.createFromHeader(fromAddress, generateTag());

            // To
            SipURI toUri = af.createSipURI(device.getGbDeviceId(),
                    device.getGbDomain() != null ? device.getGbDomain() : sipProperties.getDomain());
            Address toAddress = af.createAddress(toUri);
            ToHeader toHeader = hf.createToHeader(toAddress, null);

            // CallId
            CallIdHeader callIdHeader = sipServer.getSipProvider().getNewCallId();

            // CSeq
            CSeqHeader cSeqHeader = hf.createCSeqHeader(1L, method);

            // MaxForwards
            MaxForwardsHeader maxForwardsHeader = hf.createMaxForwardsHeader(70);

            // 构建请求
            Request request = mf.createRequest(requestUri, method, callIdHeader,
                    cSeqHeader, fromHeader, toHeader, viaHeaders, maxForwardsHeader);

            // Contact
            SipURI contactUri = af.createSipURI(sipProperties.getId(),
                    sipProperties.getIp() + ":" + sipProperties.getPort());
            Address contactAddress = af.createAddress(contactUri);
            ContactHeader contactHeader = hf.createContactHeader(contactAddress);
            request.addHeader(contactHeader);

            // Content
            if (content != null && contentType != null) {
                ContentTypeHeader ctHeader;
                if (contentType.contains("/")) {
                    String[] parts = contentType.split("/");
                    ctHeader = hf.createContentTypeHeader(parts[0], parts[1]);
                } else {
                    ctHeader = hf.createContentTypeHeader("Application", "MANSCDP+xml");
                }
                request.setContent(content, ctHeader);
            }

            return request;
        } catch (Exception e) {
            log.error("Build SIP request failed: method={}, error={}", method, e.getMessage(), e);
            return null;
        }
    }

    /**
     * 构建实时点播 SDP
     */
    private String buildPlaySdp(String channelId, String rtpIp, int rtpPort, String ssrc) {
        return "v=0\r\n"
                + "o=" + channelId + " 0 0 IN IP4 " + rtpIp + "\r\n"
                + "s=Play\r\n"
                + "c=IN IP4 " + rtpIp + "\r\n"
                + "t=0 0\r\n"
                + "m=video " + rtpPort + " RTP/AVP 96\r\n"
                + "a=recvonly\r\n"
                + "a=rtpmap:96 PS/90000\r\n"
                + "y=" + ssrc + "\r\n";
    }

    private String generateSn() {
        return String.valueOf((int) (Math.random() * 900000 + 100000));
    }

    private String generateTag() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 8);
    }
}
