package com.songhg.firefly.iot.system.dto;

import com.songhg.firefly.iot.common.base.PageQuery;
import com.songhg.firefly.iot.common.enums.LoginMethod;
import com.songhg.firefly.iot.common.enums.Platform;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

import java.time.LocalDate;

/**
 * 登录日志查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "登录日志分页查询请求")
public class LoginLogQueryDTO extends PageQuery {

    @Schema(description = "用户ID筛选")
    private Long userId;

    @Schema(description = "用户名筛选")
    private String username;

    @Schema(description = "平台筛选")
    private Platform platform;

    @Schema(description = "登录方式筛选")
    private LoginMethod loginMethod;

    @Schema(description = "结果筛选（SUCCESS/FAILURE）")
    private String result;

    @Schema(description = "开始日期")
    private LocalDate startDate;

    @Schema(description = "结束日期")
    private LocalDate endDate;
}
