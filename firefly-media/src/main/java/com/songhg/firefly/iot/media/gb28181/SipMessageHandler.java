package com.songhg.firefly.iot.media.gb28181;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.conditions.update.LambdaUpdateWrapper;
import com.songhg.firefly.iot.common.enums.VideoDeviceStatus;
import com.songhg.firefly.iot.media.entity.VideoChannel;
import com.songhg.firefly.iot.media.entity.VideoDevice;
import com.songhg.firefly.iot.media.mapper.VideoChannelMapper;
import com.songhg.firefly.iot.media.mapper.VideoDeviceMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.NodeList;
import org.xml.sax.InputSource;

import javax.sip.RequestEvent;
import javax.sip.ResponseEvent;
import javax.sip.header.ExpiresHeader;
import javax.sip.header.FromHeader;
import javax.sip.message.Request;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.StringReader;
import java.time.LocalDateTime;

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

    private final VideoDeviceMapper videoDeviceMapper;
    private final VideoChannelMapper videoChannelMapper;

    /**
     * 处理 REGISTER 请求（设备注册/注销）
     */
    public void handleRegister(RequestEvent event) {
        Request request = event.getRequest();
        try {
            FromHeader fromHeader = (FromHeader) request.getHeader(FromHeader.NAME);
            String deviceId = fromHeader.getAddress().getURI().toString();
            // 从 SIP URI 提取设备编号 (sip:xxx@domain)
            if (deviceId.contains(":")) {
                deviceId = deviceId.substring(deviceId.indexOf(":") + 1);
            }
            if (deviceId.contains("@")) {
                deviceId = deviceId.substring(0, deviceId.indexOf("@"));
            }

            // 检查 Expires 头判断注册/注销
            ExpiresHeader expiresHeader = (ExpiresHeader) request.getHeader(ExpiresHeader.NAME);
            boolean isRegister = expiresHeader == null || expiresHeader.getExpires() > 0;

            log.info("GB28181 REGISTER: deviceId={}, isRegister={}", deviceId, isRegister);

            // 更新设备状态
            LambdaUpdateWrapper<VideoDevice> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(VideoDevice::getGbDeviceId, deviceId)
                    .set(VideoDevice::getStatus, isRegister ? VideoDeviceStatus.ONLINE : VideoDeviceStatus.OFFLINE);
            if (isRegister) {
                wrapper.set(VideoDevice::getLastRegisteredAt, LocalDateTime.now());
            }
            videoDeviceMapper.update(null, wrapper);
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
        String deviceId = getElementText(doc, "DeviceID");
        NodeList itemList = doc.getElementsByTagName("Item");

        log.info("GB28181 Catalog response: deviceId={}, channelCount={}", deviceId, itemList.getLength());

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

            if (channelId == null) continue;

            // 查找对应的 video_device
            LambdaQueryWrapper<VideoDevice> deviceWrapper = new LambdaQueryWrapper<>();
            deviceWrapper.eq(VideoDevice::getGbDeviceId, deviceId);
            VideoDevice device = videoDeviceMapper.selectOne(deviceWrapper);
            if (device == null) {
                log.warn("GB28181 Catalog: device not found for gbDeviceId={}", deviceId);
                continue;
            }

            // 更新或插入通道
            LambdaQueryWrapper<VideoChannel> channelWrapper = new LambdaQueryWrapper<>();
            channelWrapper.eq(VideoChannel::getVideoDeviceId, device.getId())
                    .eq(VideoChannel::getChannelId, channelId);
            VideoChannel channel = videoChannelMapper.selectOne(channelWrapper);

            if (channel == null) {
                channel = new VideoChannel();
                channel.setVideoDeviceId(device.getId());
                channel.setChannelId(channelId);
            }
            channel.setName(name);
            channel.setManufacturer(manufacturer);
            channel.setModel(model);
            channel.setStatus("ON".equalsIgnoreCase(statusStr) ? VideoDeviceStatus.ONLINE : VideoDeviceStatus.OFFLINE);
            if (ptzTypeStr != null) {
                try { channel.setPtzType(Integer.parseInt(ptzTypeStr)); } catch (NumberFormatException ignored) {}
            }
            if (longitudeStr != null) {
                try { channel.setLongitude(Double.parseDouble(longitudeStr)); } catch (NumberFormatException ignored) {}
            }
            if (latitudeStr != null) {
                try { channel.setLatitude(Double.parseDouble(latitudeStr)); } catch (NumberFormatException ignored) {}
            }

            if (channel.getId() == null) {
                videoChannelMapper.insert(channel);
            } else {
                videoChannelMapper.updateById(channel);
            }
        }
    }

    /**
     * 处理设备心跳
     */
    private void handleKeepalive(Document doc) {
        String deviceId = getElementText(doc, "DeviceID");
        log.debug("GB28181 Keepalive: deviceId={}", deviceId);

        if (deviceId != null) {
            LambdaUpdateWrapper<VideoDevice> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(VideoDevice::getGbDeviceId, deviceId)
                    .set(VideoDevice::getStatus, VideoDeviceStatus.ONLINE)
                    .set(VideoDevice::getLastRegisteredAt, LocalDateTime.now());
            videoDeviceMapper.update(null, wrapper);
        }
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
        String deviceId = getElementText(doc, "DeviceID");
        String manufacturer = getElementText(doc, "Manufacturer");
        String model = getElementText(doc, "Model");
        String firmware = getElementText(doc, "Firmware");
        log.info("GB28181 DeviceInfo: deviceId={}, manufacturer={}, model={}, firmware={}",
                deviceId, manufacturer, model, firmware);

        if (deviceId != null) {
            LambdaUpdateWrapper<VideoDevice> wrapper = new LambdaUpdateWrapper<>();
            wrapper.eq(VideoDevice::getGbDeviceId, deviceId);
            if (manufacturer != null) wrapper.set(VideoDevice::getManufacturer, manufacturer);
            if (model != null) wrapper.set(VideoDevice::getModel, model);
            if (firmware != null) wrapper.set(VideoDevice::getFirmware, firmware);
            videoDeviceMapper.update(null, wrapper);
        }
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
}
