package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.ProjectStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.ProjectConvert;
import com.songhg.firefly.iot.system.dto.project.ProjectCreateDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectQueryDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectUpdateDTO;
import com.songhg.firefly.iot.system.dto.project.ProjectVO;
import com.songhg.firefly.iot.system.entity.Project;
import com.songhg.firefly.iot.system.entity.ProjectDevice;
import com.songhg.firefly.iot.system.entity.ProjectMember;
import com.songhg.firefly.iot.system.mapper.ProjectDeviceMapper;
import com.songhg.firefly.iot.system.mapper.ProjectMapper;
import com.songhg.firefly.iot.system.mapper.ProjectMemberMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.util.List;

@Slf4j
@Service
@RequiredArgsConstructor
public class ProjectService {

    private final ProjectMapper projectMapper;
    private final ProjectMemberMapper memberMapper;
    private final ProjectDeviceMapper deviceMapper;

    @Transactional
    public ProjectVO createProject(ProjectCreateDTO dto) {
        Long tenantId = AppContextHolder.getTenantId();
        Long userId = AppContextHolder.getUserId();

        // 检查代码唯一性
        Long count = projectMapper.selectCount(new LambdaQueryWrapper<Project>()
                .eq(Project::getTenantId, tenantId)
                .eq(Project::getCode, dto.getCode()));
        if (count > 0) {
            throw new BizException(ResultCode.PROJECT_CODE_EXISTS);
        }

        Project project = ProjectConvert.INSTANCE.toEntity(dto);
        project.setTenantId(tenantId);
        project.setStatus(ProjectStatus.ACTIVE);
        project.setCreatedBy(userId);
        projectMapper.insert(project);

        log.info("Project created: id={}, code={}, tenantId={}", project.getId(), project.getCode(), tenantId);
        return ProjectConvert.INSTANCE.toVO(project);
    }

    public ProjectVO getProjectById(Long id) {
        Project project = projectMapper.selectById(id);
        if (project == null) {
            throw new BizException(ResultCode.PROJECT_NOT_FOUND);
        }
        return ProjectConvert.INSTANCE.toVO(project);
    }

    @DataScope(projectColumn = "id", productColumn = "", deviceColumn = "", groupColumn = "")
    public IPage<ProjectVO> listProjects(ProjectQueryDTO query) {
        Long tenantId = AppContextHolder.getTenantId();
        Page<Project> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<Project> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(Project::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(w -> w.like(Project::getName, query.getKeyword())
                    .or().like(Project::getCode, query.getKeyword()));
        }
        if (query.getStatus() != null) {
            wrapper.eq(Project::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(Project::getCreatedAt);

        IPage<Project> result = projectMapper.selectPage(page, wrapper);
        return result.convert(ProjectConvert.INSTANCE::toVO);
    }

    @Transactional
    public ProjectVO updateProject(Long id, ProjectUpdateDTO dto) {
        Project project = projectMapper.selectById(id);
        if (project == null) {
            throw new BizException(ResultCode.PROJECT_NOT_FOUND);
        }
        ProjectConvert.INSTANCE.updateEntity(dto, project);
        projectMapper.updateById(project);
        return ProjectConvert.INSTANCE.toVO(project);
    }

    @Transactional
    public void updateProjectStatus(Long id, ProjectStatus status) {
        Project project = projectMapper.selectById(id);
        if (project == null) {
            throw new BizException(ResultCode.PROJECT_NOT_FOUND);
        }
        project.setStatus(status);
        projectMapper.updateById(project);
        log.info("Project status changed: id={}, status={}", id, status);
    }

    // ==================== Members ====================

    public List<ProjectMember> listMembers(Long projectId) {
        return memberMapper.selectList(new LambdaQueryWrapper<ProjectMember>()
                .eq(ProjectMember::getProjectId, projectId)
                .orderByAsc(ProjectMember::getCreatedAt));
    }

    @Transactional
    public void addMember(Long projectId, Long userId, String role) {
        Long exists = memberMapper.selectCount(new LambdaQueryWrapper<ProjectMember>()
                .eq(ProjectMember::getProjectId, projectId)
                .eq(ProjectMember::getUserId, userId));
        if (exists > 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "该用户已是项目成员");
        }
        ProjectMember member = new ProjectMember();
        member.setProjectId(projectId);
        member.setUserId(userId);
        member.setRole(role != null ? role : "MEMBER");
        member.setCreatedAt(LocalDateTime.now());
        memberMapper.insert(member);
    }

    @Transactional
    public void removeMember(Long projectId, Long userId) {
        memberMapper.delete(new LambdaQueryWrapper<ProjectMember>()
                .eq(ProjectMember::getProjectId, projectId)
                .eq(ProjectMember::getUserId, userId));
    }

    @Transactional
    public void updateMemberRole(Long projectId, Long userId, String role) {
        ProjectMember member = memberMapper.selectOne(new LambdaQueryWrapper<ProjectMember>()
                .eq(ProjectMember::getProjectId, projectId)
                .eq(ProjectMember::getUserId, userId));
        if (member != null) {
            member.setRole(role);
            memberMapper.updateById(member);
        }
    }

    // ==================== Devices ====================

    public List<ProjectDevice> listDevices(Long projectId) {
        return deviceMapper.selectList(new LambdaQueryWrapper<ProjectDevice>()
                .eq(ProjectDevice::getProjectId, projectId)
                .orderByDesc(ProjectDevice::getCreatedAt));
    }

    @Transactional
    public void bindDevice(Long projectId, Long deviceId) {
        Long exists = deviceMapper.selectCount(new LambdaQueryWrapper<ProjectDevice>()
                .eq(ProjectDevice::getProjectId, projectId)
                .eq(ProjectDevice::getDeviceId, deviceId));
        if (exists > 0) return;
        ProjectDevice pd = new ProjectDevice();
        pd.setProjectId(projectId);
        pd.setDeviceId(deviceId);
        pd.setCreatedAt(LocalDateTime.now());
        deviceMapper.insert(pd);
    }

    @Transactional
    public void unbindDevice(Long projectId, Long deviceId) {
        deviceMapper.delete(new LambdaQueryWrapper<ProjectDevice>()
                .eq(ProjectDevice::getProjectId, projectId)
                .eq(ProjectDevice::getDeviceId, deviceId));
    }

    @Transactional
    public void batchBindDevices(Long projectId, List<Long> deviceIds) {
        for (Long deviceId : deviceIds) {
            bindDevice(projectId, deviceId);
        }
    }

    @Transactional
    public void batchUnbindDevices(Long projectId, List<Long> deviceIds) {
        deviceMapper.delete(new LambdaQueryWrapper<ProjectDevice>()
                .eq(ProjectDevice::getProjectId, projectId)
                .in(ProjectDevice::getDeviceId, deviceIds));
    }
}
