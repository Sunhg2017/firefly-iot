package com.songhg.firefly.iot.system.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.system.dto.AdminSessionQueryDTO;
import com.songhg.firefly.iot.system.dto.AdminSessionTarget;
import com.songhg.firefly.iot.system.dto.AdminSessionVO;
import com.songhg.firefly.iot.system.entity.UserSession;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;

@Mapper
public interface UserSessionMapper extends BaseMapper<UserSession> {

    @InterceptorIgnore(tenantLine = "true")
    IPage<AdminSessionVO> selectAdminSessions(Page<AdminSessionVO> page,
                                              @Param("query") AdminSessionQueryDTO query,
                                              @Param("platformUser") boolean platformUser,
                                              @Param("currentTenantId") Long currentTenantId);

    @InterceptorIgnore(tenantLine = "true")
    AdminSessionTarget selectAdminSessionTarget(@Param("sessionId") Long sessionId,
                                                @Param("platformUser") boolean platformUser,
                                                @Param("currentTenantId") Long currentTenantId);

    @InterceptorIgnore(tenantLine = "true")
    AdminSessionTarget selectAdminUserTarget(@Param("username") String username,
                                             @Param("platformUser") boolean platformUser,
                                             @Param("currentTenantId") Long currentTenantId);
}
