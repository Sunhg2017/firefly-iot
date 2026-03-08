package com.songhg.firefly.iot.device.convert;

import com.songhg.firefly.iot.device.dto.product.ProductCreateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductUpdateDTO;
import com.songhg.firefly.iot.device.dto.product.ProductVO;
import com.songhg.firefly.iot.device.entity.Product;
import org.mapstruct.Mapper;
import org.mapstruct.Mapping;
import org.mapstruct.MappingTarget;
import org.mapstruct.NullValuePropertyMappingStrategy;
import org.mapstruct.factory.Mappers;

@Mapper(nullValuePropertyMappingStrategy = NullValuePropertyMappingStrategy.IGNORE)
public interface ProductConvert {

    ProductConvert INSTANCE = Mappers.getMapper(ProductConvert.class);

    ProductVO toVO(Product entity);

    @Mapping(target = "productKey", ignore = true)
    @Mapping(target = "productSecret", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "deviceCount", ignore = true)
    @Mapping(target = "createdBy", ignore = true)
    @Mapping(target = "thingModel", ignore = true)
    Product toEntity(ProductCreateDTO dto);

    @Mapping(target = "productKey", ignore = true)
    @Mapping(target = "productSecret", ignore = true)
    @Mapping(target = "status", ignore = true)
    @Mapping(target = "deviceCount", ignore = true)
    @Mapping(target = "thingModel", ignore = true)
    void updateEntity(ProductUpdateDTO dto, @MappingTarget Product entity);
}
