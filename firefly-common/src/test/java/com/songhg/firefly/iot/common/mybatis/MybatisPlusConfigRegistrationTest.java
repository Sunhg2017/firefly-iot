package com.songhg.firefly.iot.common.mybatis;

import com.baomidou.mybatisplus.autoconfigure.MybatisPlusAutoConfiguration;
import com.baomidou.mybatisplus.extension.plugins.MybatisPlusInterceptor;
import org.junit.jupiter.api.Test;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.datasource.AbstractDataSource;

import javax.sql.DataSource;
import java.sql.Connection;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;

class MybatisPlusConfigRegistrationTest {

    private final ApplicationContextRunner contextRunner = new ApplicationContextRunner()
            .withConfiguration(AutoConfigurations.of(
                    AutoConfiguredDataSourceConfiguration.class,
                    MybatisPlusAutoConfiguration.class
            ))
            .withUserConfiguration(TestConfiguration.class);

    @Test
    void registersMybatisPlusAndDataScopeInterceptorsWithAutoConfiguredDataSource() {
        contextRunner.run(context -> {
            assertThat(context).hasSingleBean(MybatisPlusInterceptor.class);
            assertThat(context).hasSingleBean(DataScopeInterceptor.class);
        });
    }

    @Configuration(proxyBeanMethods = false)
    @Import(MybatisPlusConfig.class)
    static class TestConfiguration {
    }

    @Configuration(proxyBeanMethods = false)
    static class AutoConfiguredDataSourceConfiguration {

        @Bean
        DataSource dataSource() {
            Connection connection = mock(Connection.class);
            return new AbstractDataSource() {
                @Override
                public Connection getConnection() {
                    return connection;
                }

                @Override
                public Connection getConnection(String username, String password) {
                    return connection;
                }
            };
        }
    }
}
