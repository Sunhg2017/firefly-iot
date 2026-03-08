package com.songhg.firefly.iot.device.protocolparser.controller;

import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.device.protocolparser.service.ProtocolParserService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@Tag(name = "内部协议解析定义接口", description = "供 Connector 拉取已发布协议解析定义")
@RestController
@RequestMapping("/api/v1/internal/protocol-parsers")
@RequiredArgsConstructor
public class InternalProtocolParserController {

    private final ProtocolParserService protocolParserService;

    @GetMapping("/products/{productId}/published")
    @Operation(summary = "查询产品当前生效的协议解析定义")
    public R<List<ProtocolParserPublishedDTO>> getPublishedByProductId(
            @Parameter(description = "产品编号", required = true) @PathVariable Long productId) {
        return R.ok(protocolParserService.listPublishedByProductId(productId));
    }
}
