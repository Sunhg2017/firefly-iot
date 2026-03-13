package com.songhg.firefly.iot.system.dto.alarmrecipient;

import com.songhg.firefly.iot.system.dto.user.UserOptionVO;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

/**
 * Alarm recipient group view object.
 */
@Data
@Schema(description = "Alarm recipient group")
public class AlarmRecipientGroupVO {

    @Schema(description = "Group code", example = "ARG7F3A19C2")
    private String code;

    @Schema(description = "Group name", example = "值班一组")
    private String name;

    @Schema(description = "Group description")
    private String description;

    @Schema(description = "Member count")
    private Integer memberCount;

    @Schema(description = "Member usernames")
    private List<String> memberUsernames;

    @Schema(description = "Member details")
    private List<UserOptionVO> members;

    @Schema(description = "Created at")
    private LocalDateTime createdAt;

    @Schema(description = "Updated at")
    private LocalDateTime updatedAt;
}
