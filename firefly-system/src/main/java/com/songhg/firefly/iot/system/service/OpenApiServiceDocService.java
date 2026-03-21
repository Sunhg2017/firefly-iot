package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.system.entity.OpenApiServiceDoc;
import com.songhg.firefly.iot.system.mapper.OpenApiServiceDocMapper;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDateTime;
import java.util.Locale;

@Service
@RequiredArgsConstructor
public class OpenApiServiceDocService {

    private final OpenApiServiceDocMapper openApiServiceDocMapper;

    public void saveSnapshot(String serviceCode, String apiDocJson) {
        if (!StringUtils.hasText(serviceCode) || !StringUtils.hasText(apiDocJson)) {
            return;
        }

        String normalizedServiceCode = normalizeServiceCode(serviceCode);
        OpenApiServiceDoc entity = openApiServiceDocMapper.selectOne(new LambdaQueryWrapper<OpenApiServiceDoc>()
                .eq(OpenApiServiceDoc::getServiceCode, normalizedServiceCode)
                .last("LIMIT 1"));
        if (entity == null) {
            entity = new OpenApiServiceDoc();
            entity.setServiceCode(normalizedServiceCode);
            entity.setApiDocJson(apiDocJson);
            entity.setSyncedAt(LocalDateTime.now());
            entity.setCreatedAt(LocalDateTime.now());
            entity.setUpdatedAt(LocalDateTime.now());
            openApiServiceDocMapper.insert(entity);
            return;
        }

        entity.setApiDocJson(apiDocJson);
        entity.setSyncedAt(LocalDateTime.now());
        entity.setUpdatedAt(LocalDateTime.now());
        openApiServiceDocMapper.updateById(entity);
    }

    public OpenApiServiceDoc getSnapshot(String serviceCode) {
        if (!StringUtils.hasText(serviceCode)) {
            return null;
        }
        return openApiServiceDocMapper.selectOne(new LambdaQueryWrapper<OpenApiServiceDoc>()
                .eq(OpenApiServiceDoc::getServiceCode, normalizeServiceCode(serviceCode))
                .last("LIMIT 1"));
    }

    private String normalizeServiceCode(String serviceCode) {
        return serviceCode.trim().toUpperCase(Locale.ROOT);
    }
}
