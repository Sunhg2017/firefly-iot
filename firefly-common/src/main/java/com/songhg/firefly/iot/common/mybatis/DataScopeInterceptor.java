package com.songhg.firefly.iot.common.mybatis;

import com.songhg.firefly.iot.common.enums.DataScopeType;
import lombok.extern.slf4j.Slf4j;
import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.operators.conditional.OrExpression;
import net.sf.jsqlparser.expression.StringValue;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.expression.operators.relational.InExpression;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import org.apache.ibatis.executor.statement.StatementHandler;
import org.apache.ibatis.mapping.BoundSql;
import org.apache.ibatis.plugin.Interceptor;
import org.apache.ibatis.plugin.Intercepts;
import org.apache.ibatis.plugin.Invocation;
import org.apache.ibatis.plugin.Signature;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.reflection.SystemMetaObject;

import java.sql.Connection;
import java.util.ArrayList;
import java.util.List;
import java.util.stream.Collectors;

/**
 * MyBatis 拦截器：在 SQL 执行前读取 DataScopeContextHolder 中的数据范围上下文，
 * 自动追加 WHERE 条件实现行级数据权限过滤。
 *
 * 支持的范围类型:
 *   ALL     — 不追加条件
 *   PROJECT — WHERE project_id IN (...)
 *   GROUP   — WHERE group_id IN (...)
 *   SELF    — WHERE created_by = userId
 *   CUSTOM  — WHERE project_id IN (... from dataScopeConfig)
 */
@Slf4j
@Intercepts({
        @Signature(type = StatementHandler.class, method = "prepare", args = {Connection.class, Integer.class})
})
public class DataScopeInterceptor implements Interceptor {

    @Override
    public Object intercept(Invocation invocation) throws Throwable {
        DataScopeContext ctx = DataScopeContextHolder.getAndClear();
        if (ctx == null || ctx.getScopeType() == DataScopeType.ALL) {
            return invocation.proceed();
        }

        StatementHandler handler = (StatementHandler) invocation.getTarget();
        BoundSql boundSql = handler.getBoundSql();
        String originalSql = boundSql.getSql();

        String newSql = appendDataScopeCondition(originalSql, ctx);
        if (newSql != null && !newSql.equals(originalSql)) {
            MetaObject metaObject = SystemMetaObject.forObject(boundSql);
            metaObject.setValue("sql", newSql);
            log.debug("DataScope applied [{}]: {}", ctx.getScopeType(), newSql);
        }

        return invocation.proceed();
    }

    private String appendDataScopeCondition(String sql, DataScopeContext ctx) {
        try {
            Statement statement = CCJSqlParserUtil.parse(sql);
            if (!(statement instanceof Select)) {
                return sql;
            }

            Select select = (Select) statement;
            if (!(select.getSelectBody() instanceof PlainSelect)) {
                return sql;
            }

            PlainSelect plainSelect = (PlainSelect) select.getSelectBody();
            Expression where = plainSelect.getWhere();
            Expression scopeExpr = buildScopeExpression(ctx);

            if (scopeExpr == null) {
                return sql;
            }

            if (where == null) {
                plainSelect.setWhere(scopeExpr);
            } else {
                plainSelect.setWhere(new AndExpression(where, scopeExpr));
            }

            return select.toString();
        } catch (JSQLParserException e) {
            log.warn("Failed to parse SQL for DataScope injection: {}", e.getMessage());
            return sql;
        }
    }

    private Expression buildScopeExpression(DataScopeContext ctx) {
        String alias = ctx.getTableAlias() != null && !ctx.getTableAlias().isBlank()
                ? ctx.getTableAlias() + "." : "";
        String projectCol = ctx.getProjectColumn() != null ? ctx.getProjectColumn() : "project_id";
        String productCol = ctx.getProductColumn() != null ? ctx.getProductColumn() : "product_id";
        String deviceCol = ctx.getDeviceColumn() != null ? ctx.getDeviceColumn() : "device_id";
        String groupCol = ctx.getGroupColumn() != null ? ctx.getGroupColumn() : "group_id";
        String createdByCol = ctx.getCreatedByColumn() != null ? ctx.getCreatedByColumn() : "created_by";

        return switch (ctx.getScopeType()) {
            case PROJECT, GROUP, CUSTOM -> buildScopedResourceExpression(
                    alias,
                    projectCol,
                    productCol,
                    deviceCol,
                    groupCol,
                    ctx);
            case SELF -> {
                if (ctx.getUserId() == null) yield null;
                EqualsTo eq = new EqualsTo();
                eq.setLeftExpression(new Column(alias + createdByCol));
                eq.setRightExpression(new LongValue(ctx.getUserId()));
                yield eq;
            }
            default -> null;
        };
    }

    private Expression buildScopedResourceExpression(
            String alias,
            String projectCol,
            String productCol,
            String deviceCol,
            String groupCol,
            DataScopeContext ctx) {
        List<Expression> expressions = new ArrayList<>();
        Expression projectExpression = buildInExpression(qualifyColumn(alias, projectCol), ctx.getProjectIds(), false);
        if (projectExpression != null) {
            expressions.add(projectExpression);
        }
        Expression productExpression = buildInExpression(qualifyColumn(alias, productCol), ctx.getProductIds(), false);
        if (productExpression != null) {
            expressions.add(productExpression);
        }
        Expression deviceExpression = buildInExpression(qualifyColumn(alias, deviceCol), ctx.getDeviceIds(), false);
        if (deviceExpression != null) {
            expressions.add(deviceExpression);
        }
        Expression groupExpression = buildStringInExpression(qualifyColumn(alias, groupCol), ctx.getGroupIds(), false);
        if (groupExpression != null) {
            expressions.add(groupExpression);
        }
        if (expressions.isEmpty()) {
            EqualsTo denyAll = new EqualsTo();
            denyAll.setLeftExpression(new LongValue(1));
            denyAll.setRightExpression(new LongValue(0));
            return denyAll;
        }
        Expression merged = expressions.get(0);
        for (int index = 1; index < expressions.size(); index++) {
            merged = new OrExpression(merged, expressions.get(index));
        }
        return merged;
    }

    private String qualifyColumn(String alias, String column) {
        if (column == null || column.isBlank()) {
            return null;
        }
        return alias + column;
    }

    private Expression buildInExpression(String column, List<Long> ids, boolean emptyAsDenyAll) {
        if (column == null || column.isBlank()) {
            return null;
        }
        if (ids == null || ids.isEmpty()) {
            if (!emptyAsDenyAll) {
                return null;
            }
            InExpression in = new InExpression();
            in.setLeftExpression(new Column(column));
            in.setRightExpression(new ExpressionList(new LongValue(-1)));
            return in;
        }
        InExpression in = new InExpression();
        in.setLeftExpression(new Column(column));
        List<Expression> values = ids.stream()
                .map(id -> (Expression) new LongValue(id))
                .collect(Collectors.toList());
        in.setRightExpression(new ExpressionList(values));
        return in;
    }

    private Expression buildStringInExpression(String column, List<String> ids, boolean emptyAsDenyAll) {
        if (column == null || column.isBlank()) {
            return null;
        }
        if (ids == null || ids.isEmpty()) {
            if (!emptyAsDenyAll) {
                return null;
            }
            InExpression in = new InExpression();
            in.setLeftExpression(new Column(column));
            in.setRightExpression(new ExpressionList(new StringValue("__NONE__")));
            return in;
        }
        InExpression in = new InExpression();
        in.setLeftExpression(new Column(column));
        List<Expression> values = ids.stream()
                .map(id -> (Expression) new StringValue(id))
                .collect(Collectors.toList());
        in.setRightExpression(new ExpressionList(values));
        return in;
    }
}
