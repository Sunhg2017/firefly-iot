package com.songhg.firefly.iot.connector.protocol;

import com.songhg.firefly.iot.api.client.ProductClient;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.result.ResultCode;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/**
 * Device-facing product helpers used by the simulator and protocol debugging tools.
 */
@Tag(name = "产品协议辅助接口", description = "供设备侧调试工具按 ProductKey 获取产品物模型")
@RestController
@RequestMapping("/api/v1/protocol/products")
@RequiredArgsConstructor
public class ProductProtocolController {

    private final ProductClient productClient;

    @GetMapping("/thing-model")
    @Operation(summary = "按 ProductKey 获取产品物模型")
    public R<String> getThingModel(@RequestParam("productKey") String productKey) {
        if (productKey == null || productKey.isBlank()) {
            throw new BizException(ResultCode.PARAM_ERROR, "productKey 不能为空");
        }
        R<String> response = productClient.getThingModelByProductKey(productKey.trim());
        if (response == null) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "获取产品物模型失败");
        }
        if (response.getCode() != 0) {
            throw new BizException(ResultCode.INTERNAL_ERROR, response.getMessage());
        }
        return R.ok(response.getData());
    }
}
