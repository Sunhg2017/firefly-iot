package com.songhg.firefly.iot.system.dto.alarmrecipient;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import lombok.Data;

import java.util.List;

/**
 * Alarm recipient group create/update payload.
 */
@Data
@Schema(description = "Alarm recipient group create/update request")
public class AlarmRecipientGroupCreateDTO {

    @Schema(description = "Group name", example = "值班一组")
    @NotBlank(message = "接收组名称不能为空")
    @Size(max = 128, message = "接收组名称长度不能超过 128 个字符")
    private String name;

    @Schema(description = "Group description", example = "负责生产环境一线告警接收")
    @Size(max = 500, message = "接收组说明长度不能超过 500 个字符")
    private String description;

    @Schema(description = "Member usernames")
    private List<String> memberUsernames;
}
