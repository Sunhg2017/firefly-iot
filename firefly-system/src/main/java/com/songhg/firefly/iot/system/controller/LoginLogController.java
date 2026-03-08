package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.system.dto.LoginLogQueryDTO;
import com.songhg.firefly.iot.system.dto.LoginLogVO;
import com.songhg.firefly.iot.system.service.AuthService;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "登录日志", description = "查询用户登录日志记录")
@RestController
@RequestMapping("/api/v1/login-logs")
@RequiredArgsConstructor
public class LoginLogController {

    private final AuthService authService;

    @Operation(summary = "分页查询登录日志")
    @PostMapping("/list")
    @RequiresPermission("audit:read")
    public R<IPage<LoginLogVO>> queryLoginLogs(@RequestBody LoginLogQueryDTO query) {
        return R.ok(authService.queryLoginLogs(query));
    }
}
