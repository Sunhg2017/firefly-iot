package com.songhg.firefly.iot.system.dto.dict;

import com.songhg.firefly.iot.common.base.PageQuery;
import io.swagger.v3.oas.annotations.media.Schema;
import lombok.Data;
import lombok.EqualsAndHashCode;

/**
 * 字典类型分页查询请求
 */
@Data
@EqualsAndHashCode(callSuper = true)
@Schema(description = "字典类型分页查询请求")
public class DictTypeQueryDTO extends PageQuery {

    @Schema(description = "搜索关键字")
    private String keyword;
}
