package com.songhg.firefly.iot.data.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.data.dto.dashboard.CustomDashboardSaveDTO;
import com.songhg.firefly.iot.data.dto.dashboard.CustomDashboardVO;
import com.songhg.firefly.iot.data.entity.CustomDashboard;
import com.songhg.firefly.iot.data.mapper.CustomDashboardMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * 自定义看板 / 运营大屏服务。
 * <p>
 * 后端只保存看板元数据与布局 JSON，组件数据仍由既有 {@code dashboard/*} 数据接口提供，
 * 前端按组件类型渲染，避免在服务端维护一套数据源引擎。
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CustomDashboardService {

    private static final String SLUG_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789";
    private static final int SLUG_LENGTH = 12;

    private final CustomDashboardMapper customDashboardMapper;
    private final SecureRandom secureRandom = new SecureRandom();

    public List<CustomDashboardVO> list() {
        Long tenantId = requireTenantId();
        LambdaQueryWrapper<CustomDashboard> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CustomDashboard::getTenantId, tenantId)
                .orderByDesc(CustomDashboard::getUpdatedAt);
        return customDashboardMapper.selectList(wrapper).stream()
                .map(this::toVO)
                .toList();
    }

    public CustomDashboardVO get(String slug) {
        return toVO(requireOwned(slug));
    }

    public CustomDashboardVO create(CustomDashboardSaveDTO dto) {
        Long tenantId = requireTenantId();
        CustomDashboard entity = new CustomDashboard();
        entity.setTenantId(tenantId);
        entity.setSlug(generateUniqueSlug(tenantId));
        entity.setName(dto.getName());
        entity.setDescription(dto.getDescription());
        entity.setLayout(dto.getLayout() == null ? "[]" : dto.getLayout());
        entity.setShareEnabled(false);
        entity.setCreatedBy(AppContextHolder.getUserId());
        customDashboardMapper.insert(entity);
        return toVO(entity);
    }

    public CustomDashboardVO update(String slug, CustomDashboardSaveDTO dto) {
        CustomDashboard entity = requireOwned(slug);
        entity.setName(dto.getName());
        entity.setDescription(dto.getDescription());
        if (dto.getLayout() != null) {
            entity.setLayout(dto.getLayout());
        }
        entity.setUpdatedAt(LocalDateTime.now());
        customDashboardMapper.updateById(entity);
        return toVO(entity);
    }

    public void delete(String slug) {
        CustomDashboard entity = requireOwned(slug);
        customDashboardMapper.deleteById(entity.getId());
    }

    /**
     * 切换分享：开启时生成 share_token，关闭时清空。分享仍是租户内分享（读取时校验租户归属）。
     */
    public CustomDashboardVO setShare(String slug, boolean enabled) {
        CustomDashboard entity = requireOwned(slug);
        entity.setShareEnabled(enabled);
        entity.setShareToken(enabled ? UUID.randomUUID().toString().replace("-", "") : null);
        entity.setUpdatedAt(LocalDateTime.now());
        customDashboardMapper.updateById(entity);
        return toVO(entity);
    }

    /**
     * 按分享令牌读取（供运营大屏分享链接使用）；仍校验租户归属，避免令牌被跨租户枚举。
     */
    public CustomDashboardVO getByShareToken(String shareToken) {
        Long tenantId = requireTenantId();
        if (shareToken == null || shareToken.isBlank()) {
            throw new BizException(ResultCode.NOT_FOUND, "分享令牌无效");
        }
        LambdaQueryWrapper<CustomDashboard> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CustomDashboard::getShareToken, shareToken)
                .eq(CustomDashboard::getShareEnabled, true)
                .eq(CustomDashboard::getTenantId, tenantId)
                .last("LIMIT 1");
        CustomDashboard entity = customDashboardMapper.selectOne(wrapper);
        if (entity == null) {
            throw new BizException(ResultCode.NOT_FOUND, "分享的看板不存在或已关闭分享");
        }
        return toVO(entity);
    }

    private CustomDashboard requireOwned(String slug) {
        Long tenantId = requireTenantId();
        if (slug == null || slug.isBlank()) {
            throw new BizException(ResultCode.NOT_FOUND, "看板不存在");
        }
        LambdaQueryWrapper<CustomDashboard> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(CustomDashboard::getTenantId, tenantId)
                .eq(CustomDashboard::getSlug, slug)
                .last("LIMIT 1");
        CustomDashboard entity = customDashboardMapper.selectOne(wrapper);
        if (entity == null) {
            throw new BizException(ResultCode.NOT_FOUND, "看板不存在");
        }
        return entity;
    }

    private String generateUniqueSlug(Long tenantId) {
        for (int attempt = 0; attempt < 5; attempt++) {
            String slug = randomSlug();
            Long count = customDashboardMapper.selectCount(
                    new LambdaQueryWrapper<CustomDashboard>()
                            .eq(CustomDashboard::getTenantId, tenantId)
                            .eq(CustomDashboard::getSlug, slug));
            if (count == null || count == 0) {
                return slug;
            }
        }
        throw new BizException(ResultCode.INTERNAL_ERROR, "生成看板唯一标识失败，请重试");
    }

    private String randomSlug() {
        StringBuilder sb = new StringBuilder(SLUG_LENGTH);
        for (int i = 0; i < SLUG_LENGTH; i++) {
            sb.append(SLUG_ALPHABET.charAt(secureRandom.nextInt(SLUG_ALPHABET.length())));
        }
        return sb.toString();
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null) {
            throw new BizException(ResultCode.UNAUTHORIZED, "缺少租户上下文");
        }
        return tenantId;
    }

    private CustomDashboardVO toVO(CustomDashboard entity) {
        CustomDashboardVO vo = new CustomDashboardVO();
        vo.setSlug(entity.getSlug());
        vo.setName(entity.getName());
        vo.setDescription(entity.getDescription());
        vo.setLayout(entity.getLayout());
        vo.setShareEnabled(entity.getShareEnabled());
        vo.setShareToken(entity.getShareToken());
        vo.setUpdatedAt(entity.getUpdatedAt());
        return vo;
    }
}
