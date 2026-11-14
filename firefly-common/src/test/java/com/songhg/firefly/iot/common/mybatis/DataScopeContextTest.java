package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.enums.DataScopeType;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * ACC-001 回归：设备授权只认项目归属与设备集合，产品维度不得跨项目授权设备。
 */
class DataScopeContextTest {

    @Test
    void productRelationMustNotGrantCrossProjectDevice() {
        DataScopeContext ctx = new DataScopeContext();
        ctx.setScopeType(DataScopeType.CUSTOM);
        ctx.setProjectIds(List.of(100L));
        ctx.setProductIds(List.of(200L));
        ctx.setDeviceIds(List.of(10L));

        // 设备 11：项目 101、产品 200、未被授权
        assertFalse(ctx.allowsDevice(101L, 11L));
        // 授权项目下的设备
        assertTrue(ctx.allowsDevice(100L, 99L));
        // 显式授权设备（分组/直授）
        assertTrue(ctx.allowsDevice(999L, 10L));
    }

    @Test
    void allScopeAllowsEveryDevice() {
        DataScopeContext ctx = new DataScopeContext();
        ctx.setScopeType(DataScopeType.ALL);
        assertTrue(ctx.allowsDevice(101L, 11L));
    }

    @Test
    void selfScopeIsHandledByCaller() {
        DataScopeContext ctx = new DataScopeContext();
        ctx.setScopeType(DataScopeType.SELF);
        assertFalse(ctx.allowsDevice(100L, 10L));
    }
}
