package com.songhg.firefly.iot.connector.parser.controller;

import com.songhg.firefly.iot.api.dto.ProtocolParserDebugRequestDTO;
import com.songhg.firefly.iot.api.dto.ProtocolParserDebugResponseDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.connector.parser.service.ProtocolParserDebugService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@Tag(name = "内部协议解析调试接口", description = "供 Device 服务调用的协议解析调试执行接口")
@RestController
@RequestMapping("/api/v1/internal/protocol-parsers")
@RequiredArgsConstructor
public class InternalProtocolParserDebugController {

    private final ProtocolParserDebugService protocolParserDebugService;

    @PostMapping("/debug")
    @Operation(summary = "执行协议解析调试")
    public R<ProtocolParserDebugResponseDTO> debug(@RequestBody ProtocolParserDebugRequestDTO request) {
        return R.ok(protocolParserDebugService.debug(request));
    }
}
