package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.DeviceCertificate;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface DeviceCertificateMapper extends BaseMapper<DeviceCertificate> {

    /**
     * 设备认证阶段没有请求级租户上下文，显式按租户与设备校验有效证书指纹。
     */
    @InterceptorIgnore(tenantLine = "true")
    DeviceCertificate selectActiveByFingerprint(@Param("tenantId") Long tenantId,
                                                @Param("deviceId") Long deviceId,
                                                @Param("fingerprint") String fingerprint);
}
