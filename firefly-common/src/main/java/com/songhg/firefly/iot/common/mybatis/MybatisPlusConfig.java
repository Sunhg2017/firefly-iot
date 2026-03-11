package com.songhg.firefly.iot.common.mybatis;

import com.baomidou.mybatisplus.annotation.DbType;
import com.baomidou.mybatisplus.autoconfigure.ConfigurationCustomizer;
import com.baomidou.mybatisplus.core.handlers.MetaObjectHandler;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import com.baomidou.mybatisplus.extension.plugins.handler.TenantLineHandler;
import com.baomidou.mybatisplus.extension.plugins.inner.PaginationInnerInterceptor;
import com.baomidou.mybatisplus.extension.plugins.inner.TenantLineInnerInterceptor;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import lombok.extern.slf4j.Slf4j;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.LongValue;
import org.apache.ibatis.reflection.MetaObject;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.TypeHandlerRegistry;
import org.springframework.boot.autoconfigure.condition.ConditionalOnBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.time.LocalDateTime;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Slf4j
@Configuration
@ConditionalOnClass(name = "com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor")
@ConditionalOnBean(DataSource.class)
public class MybatisPlusConfig {

    private final DataSource dataSource;
    private final Map<String, Boolean> tenantColumnCache = new ConcurrentHashMap<>();

    public MybatisPlusConfig(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Bean
    public MybatisPlusInterceptor mybatisPlusInterceptor() {
        MybatisPlusInterceptor interceptor = new MybatisPlusInterceptor();

        // Tenant isolation interceptor
        interceptor.addInnerInterceptor(new TenantLineInnerInterceptor(
                new TenantLineHandler() {
                    @Override
                    public Expression getTenantId() {
                        Long tenantId = AppContextHolder.getTenantId();
                        if (tenantId == null) {
                            throw new IllegalStateException("Tenant context not set");
                        }
                        return new LongValue(tenantId);
                    }

                    @Override
                    public boolean ignoreTable(String tableName) {
                        String normalizedTable = normalizeTableName(tableName);
                        return !hasTenantColumn(normalizedTable);
                    }
                }
        ));

        // Pagination
        interceptor.addInnerInterceptor(new PaginationInnerInterceptor(DbType.POSTGRE_SQL));
        return interceptor;
    }

    @Bean
    public DataScopeInterceptor dataScopeInterceptor() {
        return new DataScopeInterceptor();
    }

    @Bean
    public MetaObjectHandler metaObjectHandler() {
        return new MetaObjectHandler() {
            @Override
            public void insertFill(MetaObject metaObject) {
                this.strictInsertFill(metaObject, "createdAt", LocalDateTime::now, LocalDateTime.class);
                this.strictInsertFill(metaObject, "updatedAt", LocalDateTime::now, LocalDateTime.class);
            }

            @Override
            public void updateFill(MetaObject metaObject) {
                this.strictUpdateFill(metaObject, "updatedAt", LocalDateTime::now, LocalDateTime.class);
            }
        };
    }

    @Bean
    public ConfigurationCustomizer localDateTimeTypeHandlerCustomizer() {
        return configuration -> {
            TypeHandlerRegistry registry = configuration.getTypeHandlerRegistry();
            PgCompatibleLocalDateTimeTypeHandler typeHandler = new PgCompatibleLocalDateTimeTypeHandler();
            registry.register(LocalDateTime.class, typeHandler);
            registry.register(LocalDateTime.class, JdbcType.TIMESTAMP, typeHandler);
            registry.register(LocalDateTime.class, JdbcType.TIMESTAMP_WITH_TIMEZONE, typeHandler);
            registry.register(LocalDateTime.class, JdbcType.OTHER, typeHandler);
            registry.register(JdbcType.TIMESTAMP_WITH_TIMEZONE, typeHandler);
        };
    }

    private boolean hasTenantColumn(String tableName) {
        if (tableName.isBlank()) {
            return true;
        }
        return tenantColumnCache.computeIfAbsent(tableName, this::queryHasTenantColumn);
    }

    private boolean queryHasTenantColumn(String tableName) {
        try {
            try (Connection connection = dataSource.getConnection()) {
                DatabaseMetaData metaData = connection.getMetaData();
                String catalog = connection.getCatalog();
                String schema = connection.getSchema();

                if (existsTenantColumn(metaData, catalog, schema, tableName)) {
                    return true;
                }
                if (existsTenantColumn(metaData, null, schema, tableName)) {
                    return true;
                }
                if (existsTenantColumn(metaData, catalog, null, tableName)) {
                    return true;
                }
                return existsTenantColumn(metaData, null, null, tableName);
            }
        } catch (Exception ex) {
            // Fail safe to tenant-aware mode when metadata query cannot be completed.
            log.warn("Tenant column metadata query failed, table={}", tableName, ex);
            return true;
        }
    }

    private boolean existsTenantColumn(DatabaseMetaData metaData, String catalog, String schema, String tableName)
            throws Exception {
        try (ResultSet rs = metaData.getColumns(catalog, schema, tableName, "tenant_id")) {
            if (rs.next()) {
                return true;
            }
        }
        try (ResultSet rs = metaData.getColumns(catalog, schema, tableName.toUpperCase(Locale.ROOT), "TENANT_ID")) {
            if (rs.next()) {
                return true;
            }
        }
        try (ResultSet rs = metaData.getColumns(catalog, schema, tableName.toLowerCase(Locale.ROOT), "tenant_id")) {
            return rs.next();
        }
    }

    private String normalizeTableName(String tableName) {
        if (tableName == null) {
            return "";
        }
        String normalized = tableName.trim()
                .replace("`", "")
                .replace("\"", "")
                .toLowerCase(Locale.ROOT);
        int separatorIndex = normalized.lastIndexOf('.');
        if (separatorIndex >= 0 && separatorIndex < normalized.length() - 1) {
            return normalized.substring(separatorIndex + 1);
        }
        return normalized;
    }
}
