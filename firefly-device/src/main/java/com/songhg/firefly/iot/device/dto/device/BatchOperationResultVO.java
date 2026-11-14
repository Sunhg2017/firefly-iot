package com.songhg.firefly.iot.device.dto.device;

import io.swagger.v3.oas.annotations.media.Schema;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.ArrayList;
import java.util.List;

@Data
@Schema(description = "设备批量操作结果")
public class BatchOperationResultVO {

    private int requested;
    private int success;
    private int failed;
    private List<Failure> failures = new ArrayList<>();

    @Data
    @NoArgsConstructor
    @AllArgsConstructor
    public static class Failure {
        private Long deviceId;
        private String reason;
    }
}
