package com.songhg.firefly.iot.common.mybatis;

import org.apache.ibatis.type.BaseTypeHandler;
import org.apache.ibatis.type.JdbcType;
import org.apache.ibatis.type.MappedJdbcTypes;
import org.apache.ibatis.type.MappedTypes;

import java.sql.CallableStatement;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;

/**
 * Handles PostgreSQL TIMESTAMPTZ to LocalDateTime conversion while staying compatible with MySQL.
 */
@MappedTypes(LocalDateTime.class)
@MappedJdbcTypes(value = {JdbcType.TIMESTAMP, JdbcType.TIMESTAMP_WITH_TIMEZONE, JdbcType.OTHER}, includeNullJdbcType = true)
public class PgCompatibleLocalDateTimeTypeHandler extends BaseTypeHandler<LocalDateTime> {

    @Override
    public void setNonNullParameter(PreparedStatement ps, int i, LocalDateTime parameter, JdbcType jdbcType)
            throws SQLException {
        ps.setObject(i, parameter);
    }

    @Override
    public LocalDateTime getNullableResult(ResultSet rs, String columnName) throws SQLException {
        return readLocalDateTime(() -> rs.getObject(columnName, LocalDateTime.class),
                () -> rs.getObject(columnName, OffsetDateTime.class),
                () -> rs.getTimestamp(columnName));
    }

    @Override
    public LocalDateTime getNullableResult(ResultSet rs, int columnIndex) throws SQLException {
        return readLocalDateTime(() -> rs.getObject(columnIndex, LocalDateTime.class),
                () -> rs.getObject(columnIndex, OffsetDateTime.class),
                () -> rs.getTimestamp(columnIndex));
    }

    @Override
    public LocalDateTime getNullableResult(CallableStatement cs, int columnIndex) throws SQLException {
        return readLocalDateTime(() -> cs.getObject(columnIndex, LocalDateTime.class),
                () -> cs.getObject(columnIndex, OffsetDateTime.class),
                () -> cs.getTimestamp(columnIndex));
    }

    private LocalDateTime readLocalDateTime(LocalDateTimeSupplier localDateTimeSupplier,
                                            OffsetDateTimeSupplier offsetDateTimeSupplier,
                                            TimestampSupplier timestampSupplier) throws SQLException {
        try {
            LocalDateTime value = localDateTimeSupplier.get();
            if (value != null) {
                return value;
            }
        } catch (SQLException ignored) {
            // fallback
        }

        try {
            OffsetDateTime offsetValue = offsetDateTimeSupplier.get();
            if (offsetValue != null) {
                return offsetValue.toLocalDateTime();
            }
        } catch (SQLException ignored) {
            // fallback
        }

        Timestamp timestamp = timestampSupplier.get();
        return timestamp != null ? timestamp.toLocalDateTime() : null;
    }

    @FunctionalInterface
    private interface LocalDateTimeSupplier {
        LocalDateTime get() throws SQLException;
    }

    @FunctionalInterface
    private interface OffsetDateTimeSupplier {
        OffsetDateTime get() throws SQLException;
    }

    @FunctionalInterface
    private interface TimestampSupplier {
        Timestamp get() throws SQLException;
    }
}
