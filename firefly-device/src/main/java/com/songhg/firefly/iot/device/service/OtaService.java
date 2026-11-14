package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.FirmwareStatus;
import com.songhg.firefly.iot.common.enums.OtaDeviceStatus;
import com.songhg.firefly.iot.common.enums.OtaTaskStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.convert.OtaConvert;
import com.songhg.firefly.iot.device.dto.ota.FirmwareCreateDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareQueryDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareUpdateDTO;
import com.songhg.firefly.iot.device.dto.ota.FirmwareVO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskCreateDTO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskDeviceVO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskQueryDTO;
import com.songhg.firefly.iot.device.dto.ota.OtaTaskVO;
import com.songhg.firefly.iot.common.message.DeviceMessage;
import com.songhg.firefly.iot.device.config.OtaProperties;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.entity.Firmware;
import com.songhg.firefly.iot.device.entity.OtaTask;
import com.songhg.firefly.iot.device.entity.OtaTaskDevice;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.FirmwareMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskDeviceMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.util.StringUtils;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OtaService {

    private final FirmwareMapper firmwareMapper;
    private final OtaTaskMapper otaTaskMapper;
    private final OtaTaskDeviceMapper otaTaskDeviceMapper;
    private final DeviceMapper deviceMapper;
    private final DeviceMessageProducer messageProducer;
    private final OtaProperties otaProperties;

    // ==================== Firmware ====================

    @Transactional
    public FirmwareVO createFirmware(FirmwareCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        validateChecksumFormat(dto.getMd5Checksum(), 32, "MD5");
        validateChecksumFormat(dto.getSha256Checksum(), 64, "SHA-256");

        LambdaQueryWrapper<Firmware> check = new LambdaQueryWrapper<>();
        check.eq(Firmware::getProductId, dto.getProductId()).eq(Firmware::getVersion, dto.getVersion());
        if (firmwareMapper.selectCount(check) > 0) {
            throw new BizException(ResultCode.FIRMWARE_VERSION_EXISTS);
        }

        Firmware firmware = OtaConvert.INSTANCE.toFirmwareEntity(dto);
        firmware.setTenantId(tenantId);
        firmware.setStatus(FirmwareStatus.DRAFT);
        firmware.setCreatedBy(AppContextHolder.getUserId());
        firmwareMapper.insert(firmware);

        log.info("Firmware created: id={}, product={}, version={}", firmware.getId(), dto.getProductId(), dto.getVersion());
        return OtaConvert.INSTANCE.toFirmwareVO(firmware);
    }

    public FirmwareVO getFirmwareById(Long id) {
        Firmware firmware = firmwareMapper.selectById(id);
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        return OtaConvert.INSTANCE.toFirmwareVO(firmware);
    }

    @DataScope(projectColumn = "", productColumn = "product_id", deviceColumn = "", groupColumn = "")
    public IPage<FirmwareVO> listFirmwares(FirmwareQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<Firmware> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<Firmware> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Firmware::getTenantId, tenantId);
        if (query.getProductId() != null) {
            wrapper.eq(Firmware::getProductId, query.getProductId());
        }
        if (query.getStatus() != null) {
            wrapper.eq(Firmware::getStatus, query.getStatus());
        }
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(Firmware::getVersion, query.getKeyword())
                    .or().like(Firmware::getDisplayName, query.getKeyword()));
        }
        wrapper.orderByDesc(Firmware::getCreatedAt);

        IPage<Firmware> result = firmwareMapper.selectPage(page, wrapper);
        return result.convert(OtaConvert.INSTANCE::toFirmwareVO);
    }

    @Transactional
    public FirmwareVO updateFirmware(Long id, FirmwareUpdateDTO dto) {
        Firmware firmware = firmwareMapper.selectById(id);
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        if (firmware.getStatus() != FirmwareStatus.DRAFT) {
            throw new BizException(ResultCode.FIRMWARE_STATUS_ERROR);
        }
        OtaConvert.INSTANCE.updateFirmwareEntity(dto, firmware);
        firmwareMapper.updateById(firmware);
        return OtaConvert.INSTANCE.toFirmwareVO(firmware);
    }

    /**
     * 固件校验：摘要格式、摘要存在性与可选 RSA/ECDSA 签名验证。
     * 签名针对 SHA-256 摘要字节（十六进制解码后），与设备侧验签口径一致。
     */
    @Transactional
    public void verifyFirmware(Long id) {
        Firmware firmware = firmwareMapper.selectById(id);
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        if (firmware.getStatus() != FirmwareStatus.DRAFT) {
            throw new BizException(ResultCode.FIRMWARE_STATUS_ERROR);
        }
        validateChecksumFormat(firmware.getMd5Checksum(), 32, "MD5");
        validateChecksumFormat(firmware.getSha256Checksum(), 64, "SHA-256");
        if (!StringUtils.hasText(firmware.getMd5Checksum()) && !StringUtils.hasText(firmware.getSha256Checksum())) {
            throw new BizException(ResultCode.PARAM_ERROR, "固件缺少校验值，无法校验");
        }
        if (StringUtils.hasText(firmware.getSignature())) {
            verifyFirmwareSignature(firmware);
        }
        firmware.setStatus(FirmwareStatus.VERIFIED);
        firmwareMapper.updateById(firmware);
        log.info("Firmware verified: id={}, signatureVerified={}", id, StringUtils.hasText(firmware.getSignature()));
    }

    @Transactional
    public void releaseFirmware(Long id) {
        Firmware firmware = firmwareMapper.selectById(id);
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        if (firmware.getStatus() != FirmwareStatus.VERIFIED) {
            throw new BizException(ResultCode.FIRMWARE_STATUS_ERROR);
        }
        firmware.setStatus(FirmwareStatus.RELEASED);
        firmwareMapper.updateById(firmware);
        log.info("Firmware released: id={}", id);
    }

    @Transactional
    public void deleteFirmware(Long id) {
        Firmware firmware = firmwareMapper.selectById(id);
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        if (firmware.getStatus() == FirmwareStatus.RELEASED) {
            throw new BizException(ResultCode.FIRMWARE_STATUS_ERROR);
        }
        firmwareMapper.deleteById(id);
        log.info("Firmware deleted: id={}", id);
    }

    // ==================== OTA Tasks ====================

    /**
     * 创建升级任务并立即展开目标设备：
     * 1) 按 deviceIds 或 产品 + 源版本 解析设备，灰度比例只覆盖前 N% 设备；
     * 2) 写入 ota_task_devices 记录（PENDING）；
     * 3) 逐设备投递 OTA_UPGRADE 下行，回写消息号并置为 DOWNLOADING。
     */
    @Transactional
    public OtaTaskVO createOtaTask(OtaTaskCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();

        Firmware firmware = firmwareMapper.selectById(dto.getFirmwareId());
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        if (firmware.getStatus() != FirmwareStatus.RELEASED) {
            throw new BizException(ResultCode.FIRMWARE_STATUS_ERROR);
        }
        if (!firmware.getProductId().equals(dto.getProductId())) {
            throw new BizException(ResultCode.PARAM_ERROR, "固件不属于所选产品");
        }

        List<Device> targetDevices = resolveTargetDevices(dto);
        if (targetDevices.isEmpty()) {
            throw new BizException(ResultCode.PARAM_ERROR, "没有匹配的升级设备");
        }

        OtaTask task = OtaConvert.INSTANCE.toTaskEntity(dto);
        task.setTenantId(tenantId);
        task.setStatus(OtaTaskStatus.IN_PROGRESS);
        task.setTotalCount(targetDevices.size());
        task.setSuccessCount(0);
        task.setFailureCount(0);
        task.setCreatedBy(AppContextHolder.getUserId());
        task.setStartedAt(LocalDateTime.now());
        otaTaskMapper.insert(task);

        for (Device device : targetDevices) {
            OtaTaskDevice record = new OtaTaskDevice();
            record.setTaskId(task.getId());
            record.setDeviceId(device.getId());
            record.setStatus(OtaDeviceStatus.PENDING);
            record.setProgress(0);
            otaTaskDeviceMapper.insert(record);
        }
        for (Device device : targetDevices) {
            publishUpgradeCommand(task, firmware, device);
        }

        log.info("OTA task created and dispatched: id={}, name={}, firmware={}, devices={}",
                task.getId(), task.getName(), dto.getFirmwareId(), targetDevices.size());
        return OtaConvert.INSTANCE.toTaskVO(task);
    }

    public OtaTaskVO getOtaTaskById(Long id) {
        OtaTask task = otaTaskMapper.selectById(id);
        if (task == null) {
            throw new BizException(ResultCode.OTA_TASK_NOT_FOUND);
        }
        OtaTaskVO vo = OtaConvert.INSTANCE.toTaskVO(task);

        vo.setDevices(loadTaskDevices(id));
        return vo;
    }

    public List<OtaTaskDeviceVO> listTaskDevices(Long taskId) {
        OtaTask task = otaTaskMapper.selectById(taskId);
        if (task == null) {
            throw new BizException(ResultCode.OTA_TASK_NOT_FOUND);
        }
        return loadTaskDevices(taskId);
    }

    private List<OtaTaskDeviceVO> loadTaskDevices(Long taskId) {
        LambdaQueryWrapper<OtaTaskDevice> deviceWrapper = new LambdaQueryWrapper<>();
        deviceWrapper.eq(OtaTaskDevice::getTaskId, taskId).orderByAsc(OtaTaskDevice::getId);
        List<OtaTaskDeviceVO> devices = otaTaskDeviceMapper.selectList(deviceWrapper)
                .stream().map(OtaConvert.INSTANCE::toTaskDeviceVO).collect(Collectors.toList());
        if (devices.isEmpty()) {
            return devices;
        }
        List<Long> deviceIds = devices.stream().map(OtaTaskDeviceVO::getDeviceId).distinct().toList();
        Map<Long, String> deviceNameMap = deviceMapper.selectBatchIds(deviceIds).stream()
                .collect(Collectors.toMap(Device::getId, Device::getDeviceName, (left, right) -> left));
        devices.forEach(item -> item.setDeviceName(deviceNameMap.get(item.getDeviceId())));
        return devices;
    }

    private List<Device> resolveTargetDevices(OtaTaskCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        LambdaQueryWrapper<Device> wrapper = new LambdaQueryWrapper<Device>()
                .eq(Device::getTenantId, tenantId)
                .eq(Device::getProductId, dto.getProductId())
                .isNull(Device::getDeletedAt);
        if (dto.getDeviceIds() != null && !dto.getDeviceIds().isEmpty()) {
            wrapper.in(Device::getId, dto.getDeviceIds());
        }
        if (StringUtils.hasText(dto.getSrcVersion())) {
            wrapper.eq(Device::getFirmwareVersion, dto.getSrcVersion());
        }
        wrapper.orderByAsc(Device::getId);
        List<Device> devices = deviceMapper.selectList(wrapper);
        Integer grayRatio = dto.getGrayRatio();
        if (grayRatio != null && grayRatio > 0 && grayRatio < 100 && devices.size() > 1) {
            int target = Math.max(1, (int) Math.ceil(devices.size() * grayRatio / 100.0));
            return devices.subList(0, target);
        }
        return devices;
    }

    private void publishUpgradeCommand(OtaTask task, Firmware firmware, Device device) {
        Map<String, Object> payload = new LinkedHashMap<>();
        payload.put("taskId", task.getId());
        payload.put("firmwareId", firmware.getId());
        payload.put("version", firmware.getVersion());
        payload.put("url", firmware.getFileUrl());
        payload.put("fileSize", firmware.getFileSize());
        payload.put("md5", firmware.getMd5Checksum());
        payload.put("sha256", firmware.getSha256Checksum());
        payload.put("signature", firmware.getSignature());

        DeviceMessage message = DeviceMessage.builder()
                .tenantId(device.getTenantId())
                .productId(device.getProductId())
                .deviceId(device.getId())
                .deviceName(device.getDeviceName())
                .type(DeviceMessage.MessageType.OTA_UPGRADE)
                .payload(payload)
                .timestamp(System.currentTimeMillis())
                .build();
        messageProducer.publishDownstream(message);

        OtaTaskDevice record = otaTaskDeviceMapper.selectOne(new LambdaQueryWrapper<OtaTaskDevice>()
                .eq(OtaTaskDevice::getTaskId, task.getId())
                .eq(OtaTaskDevice::getDeviceId, device.getId())
                .orderByDesc(OtaTaskDevice::getId)
                .last("LIMIT 1"));
        if (record != null) {
            LocalDateTime now = LocalDateTime.now();
            record.setMessageId(message.getMessageId());
            record.setStatus(OtaDeviceStatus.DOWNLOADING);
            record.setStartedAt(now);
            record.setUpdatedAt(now);
            otaTaskDeviceMapper.updateById(record);
        }
    }

    private void validateChecksumFormat(String checksum, int expectedLength, String label) {
        if (!StringUtils.hasText(checksum)) {
            return;
        }
        String normalized = checksum.trim();
        if (normalized.length() != expectedLength || !normalized.matches("[0-9a-fA-F]+")) {
            throw new BizException(ResultCode.PARAM_ERROR, label + " 校验值格式不正确");
        }
    }

    private void verifyFirmwareSignature(Firmware firmware) {
        if (!StringUtils.hasText(firmware.getSha256Checksum())) {
            throw new BizException(ResultCode.PARAM_ERROR, "签名校验需要 SHA-256 摘要");
        }
        if (!StringUtils.hasText(otaProperties.getSignaturePublicKey())) {
            throw new BizException(ResultCode.PARAM_ERROR, "固件携带签名但未配置 firefly.ota.signature-public-key");
        }
        try {
            byte[] digest = HexFormat.of().parseHex(firmware.getSha256Checksum().trim());
            Signature verifier = Signature.getInstance(otaProperties.getSignatureAlgorithm());
            verifier.initVerify(loadPublicKey(otaProperties.getSignaturePublicKey(),
                    otaProperties.getSignatureAlgorithm()));
            verifier.update(digest);
            if (!verifier.verify(Base64.getDecoder().decode(firmware.getSignature().trim()))) {
                throw new BizException(ResultCode.PARAM_ERROR, "固件签名校验失败");
            }
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new BizException(ResultCode.PARAM_ERROR, "固件签名校验异常: " + ex.getMessage());
        }
    }

    private PublicKey loadPublicKey(String pem, String algorithm) throws Exception {
        String normalized = pem.replaceAll("-----[A-Z ]+-----", "").replaceAll("\\s", "");
        byte[] der = Base64.getDecoder().decode(normalized.getBytes(StandardCharsets.UTF_8));
        String keyAlgorithm = algorithm != null && algorithm.toUpperCase().contains("ECDSA") ? "EC" : "RSA";
        return KeyFactory.getInstance(keyAlgorithm).generatePublic(new X509EncodedKeySpec(der));
    }

    @DataScope(projectColumn = "", productColumn = "product_id", deviceColumn = "", groupColumn = "")
    public IPage<OtaTaskVO> listOtaTasks(OtaTaskQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<OtaTask> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<OtaTask> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(OtaTask::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(OtaTask::getName, query.getKeyword());
        }
        if (query.getProductId() != null) {
            wrapper.eq(OtaTask::getProductId, query.getProductId());
        }
        if (query.getStatus() != null) {
            wrapper.eq(OtaTask::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(OtaTask::getCreatedAt);

        IPage<OtaTask> result = otaTaskMapper.selectPage(page, wrapper);
        return result.convert(OtaConvert.INSTANCE::toTaskVO);
    }

    @Transactional
    public void cancelOtaTask(Long id) {
        OtaTask task = otaTaskMapper.selectById(id);
        if (task == null) {
            throw new BizException(ResultCode.OTA_TASK_NOT_FOUND);
        }
        if (task.getStatus() != OtaTaskStatus.PENDING && task.getStatus() != OtaTaskStatus.IN_PROGRESS) {
            throw new BizException(ResultCode.OTA_TASK_STATUS_ERROR);
        }
        task.setStatus(OtaTaskStatus.CANCELLED);
        task.setFinishedAt(LocalDateTime.now());
        otaTaskMapper.updateById(task);

        LambdaQueryWrapper<OtaTaskDevice> deviceWrapper = new LambdaQueryWrapper<>();
        deviceWrapper.eq(OtaTaskDevice::getTaskId, id)
                .in(OtaTaskDevice::getStatus, OtaDeviceStatus.PENDING, OtaDeviceStatus.DOWNLOADING, OtaDeviceStatus.UPGRADING);
        OtaTaskDevice cancelUpdate = new OtaTaskDevice();
        cancelUpdate.setStatus(OtaDeviceStatus.CANCELLED);
        otaTaskDeviceMapper.update(cancelUpdate, deviceWrapper);

        log.info("OTA task cancelled: id={}", id);
    }
}
