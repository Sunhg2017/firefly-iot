package com.songhg.firefly.iot.data.service;

import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.data.dto.dashboard.CustomDashboardSaveDTO;
import com.songhg.firefly.iot.data.dto.dashboard.CustomDashboardVO;
import com.songhg.firefly.iot.data.entity.CustomDashboard;
import com.songhg.firefly.iot.data.mapper.CustomDashboardMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class CustomDashboardServiceTest {

    @Mock
    private CustomDashboardMapper customDashboardMapper;

    private CustomDashboardService service;

    @BeforeEach
    void setUp() {
        service = new CustomDashboardService(customDashboardMapper);
        AppContextHolder.setTenantId(7L);
        AppContextHolder.setUserId(1L);
    }

    @AfterEach
    void tearDown() {
        AppContextHolder.clear();
    }

    @Test
    void createGeneratesSlugAndDefaultsLayout() {
        CustomDashboardSaveDTO dto = new CustomDashboardSaveDTO();
        dto.setName("运营大屏");
        when(customDashboardMapper.selectCount(any())).thenReturn(0L);

        CustomDashboardVO vo = service.create(dto);

        assertThat(vo.getSlug()).isNotBlank();
        assertThat(vo.getName()).isEqualTo("运营大屏");
        assertThat(vo.getLayout()).isEqualTo("[]");

        ArgumentCaptor<CustomDashboard> captor = ArgumentCaptor.forClass(CustomDashboard.class);
        verify(customDashboardMapper).insert(captor.capture());
        assertThat(captor.getValue().getTenantId()).isEqualTo(7L);
    }

    @Test
    void setShareEnableGeneratesToken() {
        CustomDashboard entity = new CustomDashboard();
        entity.setId(1L);
        entity.setTenantId(7L);
        entity.setSlug("abc123");
        entity.setName("大屏");
        entity.setLayout("[]");
        entity.setShareEnabled(false);
        when(customDashboardMapper.selectOne(any())).thenReturn(entity);

        CustomDashboardVO vo = service.setShare("abc123", true);

        assertThat(vo.getShareEnabled()).isTrue();
        assertThat(vo.getShareToken()).isNotBlank();
    }

    @Test
    void setShareDisableClearsToken() {
        CustomDashboard entity = new CustomDashboard();
        entity.setId(1L);
        entity.setTenantId(7L);
        entity.setSlug("abc123");
        entity.setName("大屏");
        entity.setLayout("[]");
        entity.setShareEnabled(true);
        entity.setShareToken("token123");
        when(customDashboardMapper.selectOne(any())).thenReturn(entity);

        CustomDashboardVO vo = service.setShare("abc123", false);

        assertThat(vo.getShareEnabled()).isFalse();
        assertThat(vo.getShareToken()).isNull();
    }
}
