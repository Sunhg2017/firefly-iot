package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.system.entity.SystemConfig;
import com.songhg.firefly.iot.system.mapper.SystemConfigMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class SystemConfigServiceTest {

    @Mock
    private SystemConfigMapper systemConfigMapper;

    @InjectMocks
    private SystemConfigService systemConfigService;

    @AfterEach
    void clearContext() {
        AppContextHolder.clear();
    }

    @Test
    void getValueShouldUseExplicitTenantLookupWithoutTenantContext() {
        SystemConfig config = new SystemConfig();
        config.setConfigValue("true");
        when(systemConfigMapper.selectByTenantIdAndConfigKey(0L, "security.oauth.wechat.enabled"))
                .thenReturn(config);

        assertThat(AppContextHolder.getTenantId()).isNull();

        String value = systemConfigService.getValue(0L, "security.oauth.wechat.enabled");

        assertThat(value).isEqualTo("true");
        verify(systemConfigMapper).selectByTenantIdAndConfigKey(0L, "security.oauth.wechat.enabled");
        verifyNoMoreInteractions(systemConfigMapper);
    }
}
