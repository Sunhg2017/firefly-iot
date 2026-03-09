package com.songhg.firefly.iot.device.protocolparser.dto;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@Schema(description = "协议解析版本视图")
public class ProtocolParserVersionVO {

    private Long id;
    private Long definitionId;
    private Integer versionNo;
    private String publishStatus;
    private String changeLog;
    private Long createdBy;
    private LocalDateTime createdAt;
}
