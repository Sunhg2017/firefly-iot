package com.songhg.firefly.iot.device.mapper;

import com.baomidou.mybatisplus.annotation.InterceptorIgnore;
import com.baomidou.mybatisplus.core.mapper.BaseMapper;
import com.songhg.firefly.iot.device.entity.Product;
import org.apache.ibatis.annotations.Mapper;
import org.apache.ibatis.annotations.Param;
import org.apache.ibatis.annotations.Select;

@Mapper
public interface ProductMapper extends BaseMapper<Product> {

    @InterceptorIgnore(tenantLine = "true")
    @Select("""
            SELECT *
            FROM products
            WHERE id = #{id}
              AND deleted_at IS NULL
            LIMIT 1
            """)
    Product selectByIdIgnoreTenant(@Param("id") Long id);

    @InterceptorIgnore(tenantLine = "true")
    @Select("""
            SELECT *
            FROM products
            WHERE product_key = #{productKey}
              AND deleted_at IS NULL
            LIMIT 1
            """)
    Product selectByProductKeyIgnoreTenant(@Param("productKey") String productKey);
}
