package com.songhg.firefly.iot.system.controller;

import com.baomidou.mybatisplus.core.metadata.IPage;
import com.songhg.firefly.iot.common.result.R;
import com.songhg.firefly.iot.common.security.RequiresPermission;
import com.songhg.firefly.iot.system.convert.DictConvert;
import com.songhg.firefly.iot.system.dto.dict.DictItemCreateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictItemUpdateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictItemVO;
import com.songhg.firefly.iot.system.dto.dict.DictTypeCreateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictTypeQueryDTO;
import com.songhg.firefly.iot.system.dto.dict.DictTypeUpdateDTO;
import com.songhg.firefly.iot.system.dto.dict.DictTypeVO;
import com.songhg.firefly.iot.system.entity.DictItem;
import com.songhg.firefly.iot.system.entity.DictType;
import com.songhg.firefly.iot.system.service.DictService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@Tag(name = "数据字典", description = "字典类型与字典项 CRUD")
@RestController
@RequestMapping("/api/v1/dicts")
@RequiredArgsConstructor
public class DictController {

    private final DictService dictService;

    // ==================== DictType ====================

    @PostMapping("/types")
    @RequiresPermission("dict:create")
    @Operation(summary = "创建字典类型")
    public R<DictTypeVO> createType(@Valid @RequestBody DictTypeCreateDTO dto) {
        DictType dictType = DictConvert.INSTANCE.toTypeEntity(dto);
        return R.ok(DictConvert.INSTANCE.toTypeVO(dictService.createType(dictType)));
    }

    @PostMapping("/types/list")
    @RequiresPermission("dict:read")
    @Operation(summary = "分页查询字典类型")
    public R<IPage<DictTypeVO>> listTypes(@RequestBody DictTypeQueryDTO query) {
        return R.ok(dictService.listTypes(query).convert(DictConvert.INSTANCE::toTypeVO));
    }

    @GetMapping("/types/{id}")
    @RequiresPermission("dict:read")
    @Operation(summary = "获取字典类型详情")
    public R<DictTypeVO> getType(@Parameter(description = "字典类型编号", required = true) @PathVariable Long id) {
        return R.ok(DictConvert.INSTANCE.toTypeVO(dictService.getTypeById(id)));
    }

    @GetMapping("/types/by-code")
    @RequiresPermission("dict:read")
    @Operation(summary = "按编码查询字典类型")
    public R<DictTypeVO> getTypeByCode(@Parameter(description = "字典类型编码", required = true) @RequestParam String code) {
        return R.ok(DictConvert.INSTANCE.toTypeVO(dictService.getTypeByCode(code)));
    }

    @PutMapping("/types/{id}")
    @RequiresPermission("dict:update")
    @Operation(summary = "更新字典类型")
    public R<DictTypeVO> updateType(@Parameter(description = "字典类型编号", required = true) @PathVariable Long id, @Valid @RequestBody DictTypeUpdateDTO dto) {
        DictType dictType = dictService.getTypeById(id);
        DictConvert.INSTANCE.updateTypeEntity(dto, dictType);
        return R.ok(DictConvert.INSTANCE.toTypeVO(dictService.updateType(id, dictType)));
    }

    @DeleteMapping("/types/{id}")
    @RequiresPermission("dict:delete")
    @Operation(summary = "删除字典类型")
    public R<Void> deleteType(@Parameter(description = "字典类型编号", required = true) @PathVariable Long id) {
        dictService.deleteType(id);
        return R.ok();
    }

    // ==================== DictItem ====================

    @PostMapping("/types/{dictTypeId}/items")
    @RequiresPermission("dict:create")
    @Operation(summary = "创建字典项")
    public R<DictItemVO> createItem(@Parameter(description = "字典类型编号", required = true) @PathVariable Long dictTypeId, @Valid @RequestBody DictItemCreateDTO dto) {
        DictItem item = DictConvert.INSTANCE.toItemEntity(dto);
        return R.ok(DictConvert.INSTANCE.toItemVO(dictService.createItem(dictTypeId, item)));
    }

    @GetMapping("/types/{dictTypeId}/items")
    @RequiresPermission("dict:read")
    @Operation(summary = "查询字典项列表")
    public R<List<DictItemVO>> listItems(@Parameter(description = "字典类型编号", required = true) @PathVariable Long dictTypeId) {
        return R.ok(dictService.listItems(dictTypeId).stream().map(DictConvert.INSTANCE::toItemVO).toList());
    }

    @GetMapping("/items/by-code")
    @RequiresPermission("dict:read")
    @Operation(summary = "按字典编码查询字典项")
    public R<List<DictItemVO>> listItemsByCode(@Parameter(description = "字典类型编码", required = true) @RequestParam String dictCode) {
        return R.ok(dictService.listItemsByCode(dictCode).stream().map(DictConvert.INSTANCE::toItemVO).toList());
    }

    @PutMapping("/items/{itemId}")
    @RequiresPermission("dict:update")
    @Operation(summary = "更新字典项")
    public R<DictItemVO> updateItem(@Parameter(description = "字典项编号", required = true) @PathVariable Long itemId, @Valid @RequestBody DictItemUpdateDTO dto) {
        DictItem item = new DictItem();
        DictConvert.INSTANCE.updateItemEntity(dto, item);
        return R.ok(DictConvert.INSTANCE.toItemVO(dictService.updateItem(itemId, item)));
    }

    @DeleteMapping("/items/{itemId}")
    @RequiresPermission("dict:delete")
    @Operation(summary = "删除字典项")
    public R<Void> deleteItem(@Parameter(description = "字典项编号", required = true) @PathVariable Long itemId) {
        dictService.deleteItem(itemId);
        return R.ok();
    }
}
