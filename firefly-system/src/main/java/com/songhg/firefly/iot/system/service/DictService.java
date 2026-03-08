package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.dto.dict.DictTypeQueryDTO;
import com.songhg.firefly.iot.system.entity.DictItem;
import com.songhg.firefly.iot.system.entity.DictType;
import com.songhg.firefly.iot.system.mapper.DictItemMapper;
import com.songhg.firefly.iot.system.mapper.DictTypeMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class DictService {

    private final DictTypeMapper dictTypeMapper;
    private final DictItemMapper dictItemMapper;

    // ==================== DictType ====================

    @Transactional
    public DictType createType(DictType dictType) {
        Long tenantId = TenantContextHolder.getTenantId();
        Long exists = dictTypeMapper.selectCount(new LambdaQueryWrapper<DictType>()
                .eq(DictType::getTenantId, tenantId)
                .eq(DictType::getCode, dictType.getCode()));
        if (exists > 0) throw new BizException(ResultCode.PARAM_ERROR, "字典编码已存在");

        dictType.setTenantId(tenantId);
        dictType.setCreatedBy(UserContextHolder.getUserId());
        if (dictType.getEnabled() == null) dictType.setEnabled(true);
        if (dictType.getSystemFlag() == null) dictType.setSystemFlag(false);
        dictTypeMapper.insert(dictType);
        log.info("DictType created: id={}, code={}", dictType.getId(), dictType.getCode());
        return dictType;
    }

    public DictType getTypeById(Long id) {
        DictType t = dictTypeMapper.selectById(id);
        if (t == null) throw new BizException(ResultCode.PARAM_ERROR, "字典类型不存在");
        return t;
    }

    public DictType getTypeByCode(String code) {
        Long tenantId = TenantContextHolder.getTenantId();
        return dictTypeMapper.selectOne(new LambdaQueryWrapper<DictType>()
                .eq(DictType::getTenantId, tenantId)
                .eq(DictType::getCode, code));
    }

    public IPage<DictType> listTypes(DictTypeQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
        Page<DictType> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<DictType> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(DictType::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(DictType::getName, query.getKeyword()).or().like(DictType::getCode, query.getKeyword()));
        }
        wrapper.orderByAsc(DictType::getCode);
        return dictTypeMapper.selectPage(page, wrapper);
    }

    @Transactional
    public DictType updateType(Long id, DictType update) {
        DictType t = getTypeById(id);
        if (Boolean.TRUE.equals(t.getSystemFlag())) throw new BizException(ResultCode.PARAM_ERROR, "系统字典不可修改");
        if (update.getName() != null) t.setName(update.getName());
        if (update.getEnabled() != null) t.setEnabled(update.getEnabled());
        if (update.getDescription() != null) t.setDescription(update.getDescription());
        dictTypeMapper.updateById(t);
        return t;
    }

    @Transactional
    public void deleteType(Long id) {
        DictType t = getTypeById(id);
        if (Boolean.TRUE.equals(t.getSystemFlag())) throw new BizException(ResultCode.PARAM_ERROR, "系统字典不可删除");
        dictItemMapper.delete(new LambdaQueryWrapper<DictItem>().eq(DictItem::getDictTypeId, id));
        dictTypeMapper.deleteById(id);
    }

    // ==================== DictItem ====================

    @Transactional
    public DictItem createItem(Long dictTypeId, DictItem item) {
        item.setDictTypeId(dictTypeId);
        if (item.getSortOrder() == null) item.setSortOrder(0);
        if (item.getEnabled() == null) item.setEnabled(true);
        item.setCreatedAt(LocalDateTime.now());
        item.setUpdatedAt(LocalDateTime.now());
        dictItemMapper.insert(item);
        return item;
    }

    public List<DictItem> listItems(Long dictTypeId) {
        return dictItemMapper.selectList(new LambdaQueryWrapper<DictItem>()
                .eq(DictItem::getDictTypeId, dictTypeId)
                .orderByAsc(DictItem::getSortOrder));
    }

    public List<DictItem> listItemsByCode(String dictCode) {
        DictType t = getTypeByCode(dictCode);
        if (t == null) return List.of();
        return listItems(t.getId());
    }

    @Transactional
    public DictItem updateItem(Long itemId, DictItem update) {
        DictItem item = dictItemMapper.selectById(itemId);
        if (item == null) throw new BizException(ResultCode.PARAM_ERROR, "字典项不存在");
        if (update.getItemValue() != null) item.setItemValue(update.getItemValue());
        if (update.getItemLabel() != null) item.setItemLabel(update.getItemLabel());
        if (update.getItemLabel2() != null) item.setItemLabel2(update.getItemLabel2());
        if (update.getSortOrder() != null) item.setSortOrder(update.getSortOrder());
        if (update.getEnabled() != null) item.setEnabled(update.getEnabled());
        if (update.getCssClass() != null) item.setCssClass(update.getCssClass());
        if (update.getDescription() != null) item.setDescription(update.getDescription());
        item.setUpdatedAt(LocalDateTime.now());
        dictItemMapper.updateById(item);
        return item;
    }

    @Transactional
    public void deleteItem(Long itemId) {
        dictItemMapper.deleteById(itemId);
    }
}
