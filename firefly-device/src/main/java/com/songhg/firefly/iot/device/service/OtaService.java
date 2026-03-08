package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
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
import com.songhg.firefly.iot.device.entity.Firmware;
import com.songhg.firefly.iot.device.entity.OtaTask;
import com.songhg.firefly.iot.device.entity.OtaTaskDevice;
import com.songhg.firefly.iot.device.mapper.FirmwareMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskDeviceMapper;
import com.songhg.firefly.iot.device.mapper.OtaTaskMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Slf4j
@Service
@RequiredArgsConstructor
public class OtaService {

    private final FirmwareMapper firmwareMapper;
    private final OtaTaskMapper otaTaskMapper;
    private final OtaTaskDeviceMapper otaTaskDeviceMapper;

    // ==================== Firmware ====================

    @Transactional
    public FirmwareVO createFirmware(FirmwareCreateDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();

        LambdaQueryWrapper<Firmware> check = new LambdaQueryWrapper<>();
        check.eq(Firmware::getProductId, dto.getProductId()).eq(Firmware::getVersion, dto.getVersion());
        if (firmwareMapper.selectCount(check) > 0) {
            throw new BizException(ResultCode.FIRMWARE_VERSION_EXISTS);
        }

        Firmware firmware = OtaConvert.INSTANCE.toFirmwareEntity(dto);
        firmware.setTenantId(tenantId);
        firmware.setStatus(FirmwareStatus.DRAFT);
        firmware.setCreatedBy(UserContextHolder.getUserId());
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

    @DataScope
    public IPage<FirmwareVO> listFirmwares(FirmwareQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
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

    @Transactional
    public void verifyFirmware(Long id) {
        Firmware firmware = firmwareMapper.selectById(id);
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        if (firmware.getStatus() != FirmwareStatus.DRAFT) {
            throw new BizException(ResultCode.FIRMWARE_STATUS_ERROR);
        }
        firmware.setStatus(FirmwareStatus.VERIFIED);
        firmwareMapper.updateById(firmware);
        log.info("Firmware verified: id={}", id);
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

    @Transactional
    public OtaTaskVO createOtaTask(OtaTaskCreateDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();

        Firmware firmware = firmwareMapper.selectById(dto.getFirmwareId());
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        if (firmware.getStatus() != FirmwareStatus.RELEASED) {
            throw new BizException(ResultCode.FIRMWARE_STATUS_ERROR);
        }

        OtaTask task = OtaConvert.INSTANCE.toTaskEntity(dto);
        task.setTenantId(tenantId);
        task.setStatus(OtaTaskStatus.PENDING);
        task.setTotalCount(0);
        task.setSuccessCount(0);
        task.setFailureCount(0);
        task.setCreatedBy(UserContextHolder.getUserId());
        otaTaskMapper.insert(task);

        log.info("OTA task created: id={}, name={}, firmware={}", task.getId(), task.getName(), dto.getFirmwareId());
        return OtaConvert.INSTANCE.toTaskVO(task);
    }

    public OtaTaskVO getOtaTaskById(Long id) {
        OtaTask task = otaTaskMapper.selectById(id);
        if (task == null) {
            throw new BizException(ResultCode.OTA_TASK_NOT_FOUND);
        }
        OtaTaskVO vo = OtaConvert.INSTANCE.toTaskVO(task);

        LambdaQueryWrapper<OtaTaskDevice> deviceWrapper = new LambdaQueryWrapper<>();
        deviceWrapper.eq(OtaTaskDevice::getTaskId, id).orderByAsc(OtaTaskDevice::getId);
        List<OtaTaskDeviceVO> devices = otaTaskDeviceMapper.selectList(deviceWrapper)
                .stream().map(OtaConvert.INSTANCE::toTaskDeviceVO).collect(Collectors.toList());
        vo.setDevices(devices);

        return vo;
    }

    @DataScope
    public IPage<OtaTaskVO> listOtaTasks(OtaTaskQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
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
