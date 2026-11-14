package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.enums.DataScopeType;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 回归测试：数据范围注入必须生成带括号的 IN 列表，并对 OR 组合整体分组。
 */
class DataScopeInterceptorTest {

    @Test
    void generatesParenthesizedInListAndGroupedOrExpression() throws Exception {
        DataScopeInterceptor interceptor = new DataScopeInterceptor();
        Method method = DataScopeInterceptor.class.getDeclaredMethod(
                "appendDataScopeCondition", String.class, DataScopeContext.class);
        method.setAccessible(true);

        DataScopeContext context = new DataScopeContext();
        context.setScopeType(DataScopeType.CUSTOM);
        context.setProjectIds(List.of(10L));
        context.setDeviceIds(List.of(20L));
        context.setProjectColumn("project_id");
        context.setProductColumn("");
        context.setDeviceColumn("id");
        context.setGroupColumn("");
        context.setCreatedByColumn("created_by");

        String sql = (String) method.invoke(interceptor,
                "SELECT * FROM devices WHERE status = 'ACTIVE' AND deleted_at IS NULL", context);

        assertThat(sql).contains("IN (10)");
        assertThat(sql).contains("IN (20)");
        // 原条件与整组数据范围之间必须有括号分组，避免 OR 越权。
        assertThat(sql).contains("AND (");
        assertThat(sql).contains("OR ");
    }
}
