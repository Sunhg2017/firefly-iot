package com.songhg.firefly.iot.device.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.device.dto.firmware.DeviceFirmwareQueryDTO;
import com.songhg.firefly.iot.device.entity.DeviceFirmware;
import com.songhg.firefly.iot.device.mapper.DeviceFirmwareMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class DeviceFirmwareService {

    private final DeviceFirmwareMapper deviceFirmwareMapper;

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
    public DeviceFirmware bindFirmware(Long deviceId, Long firmwareId, String version) {
        DeviceFirmware existing = getDeviceFirmware(deviceId);
        if (existing != null) {
            existing.setFirmwareId(firmwareId);
            existing.setCurrentVersion(version);
            existing.setUpdatedAt(LocalDateTime.now());
            deviceFirmwareMapper.updateById(existing);
            return existing;
        }
        DeviceFirmware df = new DeviceFirmware();
        df.setDeviceId(deviceId);
        df.setFirmwareId(firmwareId);
        df.setCurrentVersion(version);
        df.setUpgradeStatus("IDLE");
        df.setUpgradeProgress(0);
        df.setCreatedAt(LocalDateTime.now());
        df.setUpdatedAt(LocalDateTime.now());
        deviceFirmwareMapper.insert(df);
        log.info("Device firmware bound: deviceId={}, firmwareId={}, version={}", deviceId, firmwareId, version);
        return df;
    }

    /**
     * 批量绑定设备固件
     */
    @Transactional
    public void batchBindFirmware(List<Long> deviceIds, Long firmwareId, String version) {
        for (Long deviceId : deviceIds) {
            bindFirmware(deviceId, firmwareId, version);
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
}
