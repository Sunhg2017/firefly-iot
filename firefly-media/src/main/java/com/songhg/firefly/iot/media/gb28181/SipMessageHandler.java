package com.songhg.firefly.iot.media.gb28181;

import com.songhg.firefly.iot.api.dto.InternalVideoDeviceVO;
import com.songhg.firefly.iot.common.event.EventPublisher;
import com.songhg.firefly.iot.common.event.EventTopics;
import com.songhg.firefly.iot.common.event.VideoChannelsSyncedEvent;
import com.songhg.firefly.iot.common.event.VideoDeviceInfoSyncedEvent;
import com.songhg.firefly.iot.common.event.VideoDeviceStatusChangedEvent;
import com.songhg.firefly.iot.media.service.VideoDeviceFacade;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.sip.RequestEvent;
import javax.sip.ResponseEvent;
import javax.sip.address.URI;
import javax.sip.header.ExpiresHeader;
import javax.sip.header.FromHeader;
import javax.sip.message.Request;
import javax.sip.message.Response;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

/**
 * GB/T 28181 SIP 消息处理器
 * <p>
 * 处理设备发来的 SIP 消息：
 * - REGISTER: 设备注册/注销
 * - MESSAGE: 设备目录响应、告警通知、状态上报
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class SipMessageHandler {

    private final VideoDeviceFacade videoDeviceFacade;
    private final EventPublisher eventPublisher;

    /**
     * 处理 REGISTER 请求（设备注册/注销）
     */
    public void handleRegister(RequestEvent event) {
        Request request = event.getRequest();
        try {
            SipIdentity identity = resolveIdentity(request);
            if (identity.deviceId() == null) {
                return;
            }
            ExpiresHeader expiresHeader = (ExpiresHeader) request.getHeader(ExpiresHeader.NAME);
            boolean isRegister = expiresHeader == null || expiresHeader.getExpires() > 0;
            InternalVideoDeviceVO device = videoDeviceFacade.getByGbIdentity(identity.deviceId(), identity.gbDomain());
            if (device == null) {
                log.warn("Ignore REGISTER because video device is missing: gbDeviceId={}, gbDomain={}",
                        identity.deviceId(), identity.gbDomain());
                return;
            }
            LocalDateTime changedAt = LocalDateTime.now();
            eventPublisher.publish(
                    EventTopics.VIDEO_DEVICE_STATUS_CHANGED,
                    VideoDeviceStatusChangedEvent.of(
                            device.getTenantId(),
                            device.getDeviceId(),
                            isRegister ? "ONLINE" : "OFFLINE",
                            changedAt,
                            "firefly-media"
                    )
            );
        } catch (Exception e) {
            log.error("Error handling REGISTER: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理 MESSAGE 请求（目录响应、告警、状态上报等）
     */
    public void handleMessage(RequestEvent event) {
        Request request = event.getRequest();
        try {
            byte[] content = request.getRawContent();
            if (content == null || content.length == 0) {
                log.debug("Empty MESSAGE received");
                return;
            }

            String xmlContent = new String(content);
            Document doc = parseXml(xmlContent);
            if (doc == null) return;

            String cmdType = getElementText(doc, "CmdType");
            if (cmdType == null) {
                log.debug("MESSAGE without CmdType: {}", xmlContent);
                return;
            }

            switch (cmdType) {
                case "Catalog":
                    handleCatalogResponse(doc);
                    break;
                case "Keepalive":
                    handleKeepalive(doc);
                    break;
                case "Alarm":
                    handleAlarm(doc);
                    break;
                case "DeviceInfo":
                    handleDeviceInfo(doc);
                    break;
                default:
                    log.debug("Unhandled MESSAGE CmdType: {}", cmdType);
            }
        } catch (Exception e) {
            log.error("Error handling MESSAGE: {}", e.getMessage(), e);
        }
    }

    /**
     * 处理目录查询响应 — 解析通道列表
     */
    private void handleCatalogResponse(Document doc) {
        String gbDeviceId = trimToNull(getElementText(doc, "DeviceID"));
        NodeList itemList = doc.getElementsByTagName("Item");
        if (gbDeviceId == null) {
            return;
        }

        InternalVideoDeviceVO device = videoDeviceFacade.getByGbIdentity(gbDeviceId, null);
        if (device == null) {
            log.warn("Ignore Catalog because video device is missing: gbDeviceId={}", gbDeviceId);
            return;
        }

        List<VideoChannelsSyncedEvent.ChannelItem> channels = new ArrayList<>();
        for (int i = 0; i < itemList.getLength(); i++) {
            Element item = (Element) itemList.item(i);
            String channelId = getElementText(item, "DeviceID");
            String name = getElementText(item, "Name");
            String manufacturer = getElementText(item, "Manufacturer");
            String model = getElementText(item, "Model");
            String statusStr = getElementText(item, "Status");
            String ptzTypeStr = getElementText(item, "PTZType");
            String longitudeStr = getElementText(item, "Longitude");
            String latitudeStr = getElementText(item, "Latitude");

            if (channelId == null) {
                continue;
            }

            VideoChannelsSyncedEvent.ChannelItem channel = new VideoChannelsSyncedEvent.ChannelItem();
            channel.setChannelId(channelId);
            channel.setName(trimToNull(name));
            channel.setManufacturer(trimToNull(manufacturer));
            channel.setModel(trimToNull(model));
            channel.setStatus(parseChannelStatus(statusStr));
            channel.setPtzType(parseInteger(ptzTypeStr));
            channel.setLongitude(parseDouble(longitudeStr));
            channel.setLatitude(parseDouble(latitudeStr));
            channel.setOccurredAt(LocalDateTime.now());
            channels.add(channel);
        }

        eventPublisher.publish(
                EventTopics.VIDEO_CHANNELS_SYNCED,
                VideoChannelsSyncedEvent.of(device.getTenantId(), device.getDeviceId(), channels, "firefly-media")
        );
    }

    /**
     * 处理设备心跳
     */
    private void handleKeepalive(Document doc) {
        String gbDeviceId = trimToNull(getElementText(doc, "DeviceID"));
        if (gbDeviceId == null) {
            return;
        }
        InternalVideoDeviceVO device = videoDeviceFacade.getByGbIdentity(gbDeviceId, null);
        if (device == null) {
            log.warn("Ignore Keepalive because video device is missing: gbDeviceId={}", gbDeviceId);
            return;
        }
        eventPublisher.publish(
                EventTopics.VIDEO_DEVICE_STATUS_CHANGED,
                VideoDeviceStatusChangedEvent.of(device.getTenantId(), device.getDeviceId(), "ONLINE", LocalDateTime.now(), "firefly-media")
        );
    }

    /**
     * 处理告警通知
     */
    private void handleAlarm(Document doc) {
        String deviceId = getElementText(doc, "DeviceID");
        String alarmMethod = getElementText(doc, "AlarmMethod");
        String alarmDescription = getElementText(doc, "AlarmDescription");
        log.info("GB28181 Alarm: deviceId={}, method={}, desc={}", deviceId, alarmMethod, alarmDescription);
    }

    /**
     * 处理设备信息响应
     */
    private void handleDeviceInfo(Document doc) {
        String gbDeviceId = trimToNull(getElementText(doc, "DeviceID"));
        String manufacturer = getElementText(doc, "Manufacturer");
        String model = getElementText(doc, "Model");
        String firmware = getElementText(doc, "Firmware");
        log.info("GB28181 DeviceInfo: deviceId={}, manufacturer={}, model={}, firmware={}",
                gbDeviceId, manufacturer, model, firmware);

        if (gbDeviceId == null) {
            return;
        }
        InternalVideoDeviceVO device = videoDeviceFacade.getByGbIdentity(gbDeviceId, null);
        if (device == null) {
            log.warn("Ignore DeviceInfo because video device is missing: gbDeviceId={}", gbDeviceId);
            return;
        }
        eventPublisher.publish(
                EventTopics.VIDEO_DEVICE_INFO_SYNCED,
                VideoDeviceInfoSyncedEvent.of(
                        device.getTenantId(),
                        device.getDeviceId(),
                        trimToNull(manufacturer),
                        trimToNull(model),
                        trimToNull(firmware),
                        "firefly-media"
                )
        );
    }

    /**
     * 处理 BYE 请求
     */
    public void handleBye(RequestEvent event) {
        log.debug("GB28181 BYE received");
    }

    /**
     * 处理 SIP 响应
     */
    public void handleResponse(ResponseEvent event) {
        Response response = event.getResponse();
        int statusCode = response.getStatusCode();
        log.debug("SIP response received: statusCode={}", statusCode);
    }

    // ==================== XML 工具方法 ====================

    private Document parseXml(String xml) {
        try {
            DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
            DocumentBuilder builder = factory.newDocumentBuilder();
            return builder.parse(new InputSource(new StringReader(xml)));
        } catch (Exception e) {
            log.warn("XML parse error: {}", e.getMessage());
            return null;
        }
    }

    private String getElementText(Document doc, String tagName) {
        NodeList nodes = doc.getElementsByTagName(tagName);
        if (nodes.getLength() > 0) {
            return nodes.item(0).getTextContent();
        }
        return null;
    }

    private String getElementText(Element element, String tagName) {
        NodeList nodes = element.getElementsByTagName(tagName);
        if (nodes.getLength() > 0) {
            return nodes.item(0).getTextContent();
        }
        return null;
    }

    private SipIdentity resolveIdentity(Request request) {
        FromHeader fromHeader = (FromHeader) request.getHeader(FromHeader.NAME);
        if (fromHeader == null || fromHeader.getAddress() == null) {
            return new SipIdentity(null, null);
        }
        URI uri = fromHeader.getAddress().getURI();
        if (uri == null) {
            return new SipIdentity(null, null);
        }
        String raw = uri.toString();
        String deviceId = raw;
        if (deviceId.contains(":")) {
            deviceId = deviceId.substring(deviceId.indexOf(':') + 1);
        }
        String gbDomain = null;
        if (deviceId.contains("@")) {
            gbDomain = deviceId.substring(deviceId.indexOf('@') + 1);
            deviceId = deviceId.substring(0, deviceId.indexOf('@'));
        }
        return new SipIdentity(trimToNull(deviceId), trimToNull(gbDomain));
    }

    private String parseChannelStatus(String value) {
        return "ON".equalsIgnoreCase(trimToNull(value)) ? "ONLINE" : "OFFLINE";
    }

    private Integer parseInteger(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        try {
            return Integer.parseInt(normalized);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private Double parseDouble(String value) {
        String normalized = trimToNull(value);
        if (normalized == null) {
            return null;
        }
        try {
            return Double.parseDouble(normalized);
        } catch (NumberFormatException ex) {
            return null;
        }
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private record SipIdentity(String deviceId, String gbDomain) {
    }
}
