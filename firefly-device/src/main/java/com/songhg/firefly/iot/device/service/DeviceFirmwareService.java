package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareListQueryDTO;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareListVO;
import com.songhg.firefly.iot.device.entity.Device;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareQueryDTO;
import com.songhg.firefly.iot.device.entity.DeviceFirmware;
import com.songhg.firefly.iot.device.entity.Firmware;
import com.songhg.firefly.iot.device.mapper.DeviceMapper;
import com.songhg.firefly.iot.device.mapper.DeviceFirmwareMapper;
import com.songhg.firefly.iot.device.mapper.FirmwareMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Objects;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceFirmwareService {

    private final DeviceFirmwareMapper deviceFirmwareMapper;
    private final FirmwareMapper firmwareMapper;
    private final DeviceMapper deviceMapper;

    /**
     * 获取设备当前固件信息
     */
    public DeviceFirmware getDeviceFirmware(Long deviceId) {
        return deviceFirmwareMapper.selectOne(new LambdaQueryWrapper<DeviceFirmware>()
                .eq(DeviceFirmware::getDeviceId, deviceId)
                .orderByDesc(DeviceFirmware::getUpdatedAt)
                .last("LIMIT 1"));
    }

    /**
     * 按固件版本查询设备列表
     */
    public IPage<DeviceFirmware> listByFirmware(Long firmwareId, DeviceFirmwareQueryDTO query) {
        Page<DeviceFirmware> page = new Page<>(query.getPageNum(), query.getPageSize());
        return deviceFirmwareMapper.selectPage(page, new LambdaQueryWrapper<DeviceFirmware>()
                .eq(DeviceFirmware::getFirmwareId, firmwareId)
                .orderByDesc(DeviceFirmware::getUpdatedAt));
    }

    /**
     * 设备固件总览需要把“设备资产”和“当前固件记录”合并到一张表里，
     * 这样未登记版本的设备也能直接在同一入口完成版本绑定。
     */
    @DataScope(tableAlias = "d", projectColumn = "project_id", productColumn = "product_id", deviceColumn = "id", groupColumn = "")
    public IPage<DeviceFirmwareListVO> listBindings(DeviceFirmwareListQueryDTO query) {
        Page<DeviceFirmwareListVO> page = new Page<>(query.getPageNum(), query.getPageSize());
        return deviceFirmwareMapper.selectBindingPage(page, AppContextHolder.getTenantId(), query);
    }

    /**
     * 按版本号查询设备列表
     */
    public List<DeviceFirmware> listByVersion(String version) {
        return deviceFirmwareMapper.selectList(new LambdaQueryWrapper<DeviceFirmware>()
                .eq(DeviceFirmware::getCurrentVersion, version));
    }

    /**
     * 绑定/更新设备固件版本
     */
    @Transactional
    public DeviceFirmware bindFirmware(Long deviceId, Long firmwareId) {
        Firmware firmware = getRequiredFirmware(firmwareId);
        Device device = getRequiredDevice(deviceId);
        validateBinding(device, firmware);

        DeviceFirmware existing = getDeviceFirmware(deviceId);
        if (existing != null) {
            existing.setFirmwareId(firmwareId);
            existing.setCurrentVersion(firmware.getVersion());
            existing.setUpdatedAt(LocalDateTime.now());
            deviceFirmwareMapper.updateById(existing);
            return existing;
        }
        DeviceFirmware df = new DeviceFirmware();
        df.setDeviceId(deviceId);
        df.setFirmwareId(firmwareId);
        df.setCurrentVersion(firmware.getVersion());
        df.setUpgradeStatus("IDLE");
        df.setUpgradeProgress(0);
        df.setCreatedAt(LocalDateTime.now());
        df.setUpdatedAt(LocalDateTime.now());
        deviceFirmwareMapper.insert(df);
        log.info("Device firmware bound: deviceId={}, firmwareId={}, version={}", deviceId, firmwareId, firmware.getVersion());
        return df;
    }

    /**
     * 批量绑定设备固件
     */
    @Transactional
    public void batchBindFirmware(List<Long> deviceIds, Long firmwareId) {
        for (Long deviceId : deviceIds) {
            bindFirmware(deviceId, firmwareId);
        }
    }

    /**
     * 更新升级状态
     */
    @Transactional
    public void updateUpgradeStatus(Long deviceId, String status, Integer progress, String targetVersion) {
        DeviceFirmware df = getDeviceFirmware(deviceId);
        if (df == null) return;
        if (status != null) df.setUpgradeStatus(status);
        if (progress != null) df.setUpgradeProgress(progress);
        if (targetVersion != null) df.setTargetVersion(targetVersion);
        if ("SUCCESS".equals(status)) {
            df.setCurrentVersion(df.getTargetVersion());
            df.setTargetVersion(null);
            df.setUpgradeProgress(100);
            df.setLastUpgradeAt(LocalDateTime.now());
        }
        df.setUpdatedAt(LocalDateTime.now());
        deviceFirmwareMapper.updateById(df);
    }

    /**
     * 统计各版本设备数
     */
    public List<DeviceFirmware> listAll() {
        return deviceFirmwareMapper.selectList(new LambdaQueryWrapper<DeviceFirmware>()
                .orderByDesc(DeviceFirmware::getUpdatedAt));
    }

    private Firmware getRequiredFirmware(Long firmwareId) {
        Firmware firmware = firmwareMapper.selectById(firmwareId);
        if (firmware == null) {
            throw new BizException(ResultCode.FIRMWARE_NOT_FOUND);
        }
        return firmware;
    }

    private Device getRequiredDevice(Long deviceId) {
        Device device = deviceMapper.selectById(deviceId);
        if (device == null) {
            throw new BizException(ResultCode.DEVICE_NOT_FOUND);
        }
        return device;
    }

    private void validateBinding(Device device, Firmware firmware) {
        if (!Objects.equals(device.getProductId(), firmware.getProductId())) {
            throw new BizException(ResultCode.BAD_REQUEST, "设备与固件不属于同一产品，不能直接绑定");
        }
    }
}
