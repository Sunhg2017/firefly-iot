package com.songhg.firefly.iot.system.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.AppContextHolder;
import com.songhg.firefly.iot.common.enums.UserStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.system.convert.AlarmRecipientGroupConvert;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupCreateDTO;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupOptionVO;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupQueryDTO;
import com.songhg.firefly.iot.system.dto.alarmrecipient.AlarmRecipientGroupVO;
import com.songhg.firefly.iot.system.dto.user.UserOptionVO;
import com.songhg.firefly.iot.system.entity.AlarmRecipientGroup;
import com.songhg.firefly.iot.system.entity.AlarmRecipientGroupMember;
import com.songhg.firefly.iot.system.entity.User;
import com.songhg.firefly.iot.system.mapper.AlarmRecipientGroupMapper;
import com.songhg.firefly.iot.system.mapper.AlarmRecipientGroupMemberMapper;
import com.songhg.firefly.iot.system.mapper.UserMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Alarm recipient group management for tenant-scoped notification targeting.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AlarmRecipientGroupService {

    private final AlarmRecipientGroupMapper alarmRecipientGroupMapper;
    private final AlarmRecipientGroupMemberMapper alarmRecipientGroupMemberMapper;
    private final UserMapper userMapper;

    public IPage<AlarmRecipientGroupVO> listGroups(AlarmRecipientGroupQueryDTO query) {
        Long tenantId = requireTenantId();

        LambdaQueryWrapper<AlarmRecipientGroup> wrapper = new LambdaQueryWrapper<AlarmRecipientGroup>()
                .eq(AlarmRecipientGroup::getTenantId, tenantId)
                .orderByAsc(AlarmRecipientGroup::getName)
                .orderByDesc(AlarmRecipientGroup::getCreatedAt);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.and(item -> item.like(AlarmRecipientGroup::getName, query.getKeyword().trim())
                    .or()
                    .like(AlarmRecipientGroup::getDescription, query.getKeyword().trim()));
        }

        Page<AlarmRecipientGroup> page = new Page<>(query.getPageNum(), query.getPageSize());
        IPage<AlarmRecipientGroup> result = alarmRecipientGroupMapper.selectPage(page, wrapper);

        Page<AlarmRecipientGroupVO> voPage = new Page<>(result.getCurrent(), result.getSize(), result.getTotal());
        voPage.setRecords(buildGroupVOs(tenantId, result.getRecords()));
        return voPage;
    }

    public List<AlarmRecipientGroupOptionVO> listGroupOptions() {
        Long tenantId = requireTenantId();
        List<AlarmRecipientGroup> groups = alarmRecipientGroupMapper.selectList(
                new LambdaQueryWrapper<AlarmRecipientGroup>()
                        .eq(AlarmRecipientGroup::getTenantId, tenantId)
                        .orderByAsc(AlarmRecipientGroup::getName)
                        .orderByAsc(AlarmRecipientGroup::getCode)
        );

        if (groups.isEmpty()) {
            return List.of();
        }

        Map<Long, Integer> memberCountMap = alarmRecipientGroupMemberMapper.selectList(
                        new LambdaQueryWrapper<AlarmRecipientGroupMember>()
                                .eq(AlarmRecipientGroupMember::getTenantId, tenantId)
                                .in(AlarmRecipientGroupMember::getGroupId,
                                        groups.stream().map(AlarmRecipientGroup::getId).toList()))
                .stream()
                .collect(Collectors.groupingBy(AlarmRecipientGroupMember::getGroupId, Collectors.summingInt(item -> 1)));

        List<AlarmRecipientGroupOptionVO> options = new ArrayList<>();
        for (AlarmRecipientGroup group : groups) {
            AlarmRecipientGroupOptionVO option = new AlarmRecipientGroupOptionVO();
            option.setCode(group.getCode());
            option.setName(group.getName());
            option.setMemberCount(memberCountMap.getOrDefault(group.getId(), 0));
            options.add(option);
        }
        return options;
    }

    public AlarmRecipientGroupVO getByCode(String code) {
        Long tenantId = requireTenantId();
        AlarmRecipientGroup group = getEntityByCode(tenantId, code);
        return buildGroupVOs(tenantId, List.of(group)).getFirst();
    }

    @Transactional
    public AlarmRecipientGroupVO create(AlarmRecipientGroupCreateDTO dto) {
        Long tenantId = requireTenantId();
        AlarmRecipientGroup group = AlarmRecipientGroupConvert.INSTANCE.toEntity(dto);
        group.setTenantId(tenantId);
        group.setCode(generateGroupCode(tenantId));
        group.setName(dto.getName().trim());
        group.setDescription(trimToNull(dto.getDescription()));
        group.setCreatedBy(AppContextHolder.getUserId());
        alarmRecipientGroupMapper.insert(group);

        replaceMembers(tenantId, group.getId(), dto.getMemberUsernames());
        log.info("Alarm recipient group created: tenantId={}, code={}, name={}", tenantId, group.getCode(), group.getName());
        return getByCode(group.getCode());
    }

    @Transactional
    public AlarmRecipientGroupVO update(String code, AlarmRecipientGroupCreateDTO dto) {
        Long tenantId = requireTenantId();
        AlarmRecipientGroup group = getEntityByCode(tenantId, code);
        AlarmRecipientGroupConvert.INSTANCE.updateEntity(dto, group);
        group.setName(dto.getName().trim());
        group.setDescription(trimToNull(dto.getDescription()));
        alarmRecipientGroupMapper.updateById(group);

        replaceMembers(tenantId, group.getId(), dto.getMemberUsernames());
        log.info("Alarm recipient group updated: tenantId={}, code={}", tenantId, group.getCode());
        return getByCode(group.getCode());
    }

    @Transactional
    public void delete(String code) {
        Long tenantId = requireTenantId();
        AlarmRecipientGroup group = getEntityByCode(tenantId, code);
        alarmRecipientGroupMemberMapper.delete(new LambdaQueryWrapper<AlarmRecipientGroupMember>()
                .eq(AlarmRecipientGroupMember::getTenantId, tenantId)
                .eq(AlarmRecipientGroupMember::getGroupId, group.getId()));
        alarmRecipientGroupMapper.deleteById(group.getId());
        log.info("Alarm recipient group deleted: tenantId={}, code={}", tenantId, group.getCode());
    }

    private List<AlarmRecipientGroupVO> buildGroupVOs(Long tenantId, List<AlarmRecipientGroup> groups) {
        if (groups == null || groups.isEmpty()) {
            return List.of();
        }

        List<Long> groupIds = groups.stream().map(AlarmRecipientGroup::getId).toList();
        List<AlarmRecipientGroupMember> members = alarmRecipientGroupMemberMapper.selectList(
                new LambdaQueryWrapper<AlarmRecipientGroupMember>()
                        .eq(AlarmRecipientGroupMember::getTenantId, tenantId)
                        .in(AlarmRecipientGroupMember::getGroupId, groupIds)
        );

        Set<Long> userIds = members.stream()
                .map(AlarmRecipientGroupMember::getUserId)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
        Map<Long, UserOptionVO> userOptionMap = loadUserOptionMap(tenantId, userIds);

        Map<Long, List<UserOptionVO>> groupMemberMap = new LinkedHashMap<>();
        for (AlarmRecipientGroupMember member : members) {
            UserOptionVO user = userOptionMap.get(member.getUserId());
            if (user == null) {
                continue;
            }
            groupMemberMap.computeIfAbsent(member.getGroupId(), key -> new ArrayList<>()).add(user);
        }

        List<AlarmRecipientGroupVO> vos = new ArrayList<>();
        for (AlarmRecipientGroup group : groups) {
            AlarmRecipientGroupVO vo = AlarmRecipientGroupConvert.INSTANCE.toVO(group);
            List<UserOptionVO> groupMembers = groupMemberMap.getOrDefault(group.getId(), List.of());
            vo.setMembers(groupMembers);
            vo.setMemberUsernames(groupMembers.stream().map(UserOptionVO::getUsername).toList());
            vo.setMemberCount(groupMembers.size());
            vos.add(vo);
        }
        return vos;
    }

    private Map<Long, UserOptionVO> loadUserOptionMap(Long tenantId, Collection<Long> userIds) {
        if (userIds == null || userIds.isEmpty()) {
            return Map.of();
        }
        return userMapper.selectList(new LambdaQueryWrapper<User>()
                        .select(User::getId, User::getUsername, User::getRealName, User::getPhone, User::getEmail, User::getStatus)
                        .eq(User::getTenantId, tenantId)
                        .in(User::getId, userIds)
                        .isNull(User::getDeletedAt))
                .stream()
                .collect(Collectors.toMap(User::getId, this::toUserOption, (left, right) -> left, LinkedHashMap::new));
    }

    private void replaceMembers(Long tenantId, Long groupId, List<String> memberUsernames) {
        alarmRecipientGroupMemberMapper.delete(new LambdaQueryWrapper<AlarmRecipientGroupMember>()
                .eq(AlarmRecipientGroupMember::getTenantId, tenantId)
                .eq(AlarmRecipientGroupMember::getGroupId, groupId));

        List<User> users = resolveMembers(tenantId, memberUsernames);
        for (User user : users) {
            AlarmRecipientGroupMember member = new AlarmRecipientGroupMember();
            member.setTenantId(tenantId);
            member.setGroupId(groupId);
            member.setUserId(user.getId());
            alarmRecipientGroupMemberMapper.insert(member);
        }
    }

    private List<User> resolveMembers(Long tenantId, List<String> rawUsernames) {
        Set<String> usernames = normalizeUsernames(rawUsernames);
        if (usernames.isEmpty()) {
            return List.of();
        }

        List<User> users = userMapper.selectList(new LambdaQueryWrapper<User>()
                .select(User::getId, User::getUsername, User::getRealName, User::getPhone, User::getEmail, User::getStatus)
                .eq(User::getTenantId, tenantId)
                .in(User::getUsername, usernames)
                .eq(User::getStatus, UserStatus.ACTIVE)
                .isNull(User::getDeletedAt)
                .orderByAsc(User::getUsername));
        if (users.size() != usernames.size()) {
            Set<String> resolved = users.stream().map(User::getUsername).collect(Collectors.toSet());
            List<String> missing = usernames.stream().filter(item -> !resolved.contains(item)).toList();
            throw new BizException(ResultCode.PARAM_ERROR, "以下接收人不存在或不可用: " + String.join(", ", missing));
        }
        return users;
    }

    private Set<String> normalizeUsernames(List<String> rawUsernames) {
        if (rawUsernames == null || rawUsernames.isEmpty()) {
            return Set.of();
        }
        return rawUsernames.stream()
                .map(this::trimToNull)
                .filter(Objects::nonNull)
                .collect(Collectors.toCollection(LinkedHashSet::new));
    }

    private AlarmRecipientGroup getEntityByCode(Long tenantId, String code) {
        String normalizedCode = trimToNull(code);
        if (normalizedCode == null) {
            throw new BizException(ResultCode.PARAM_ERROR, "接收组编码不能为空");
        }
        AlarmRecipientGroup group = alarmRecipientGroupMapper.selectOne(new LambdaQueryWrapper<AlarmRecipientGroup>()
                .eq(AlarmRecipientGroup::getTenantId, tenantId)
                .eq(AlarmRecipientGroup::getCode, normalizedCode)
                .last("LIMIT 1"));
        if (group == null) {
            throw new BizException(ResultCode.NOT_FOUND, "告警接收组不存在");
        }
        return group;
    }

    private String generateGroupCode(Long tenantId) {
        for (int index = 0; index < 10; index++) {
            String code = ("ARG" + UUID.randomUUID().toString().replace("-", ""))
                    .substring(0, 11)
                    .toUpperCase(Locale.ROOT);
            Long count = alarmRecipientGroupMapper.selectCount(new LambdaQueryWrapper<AlarmRecipientGroup>()
                    .eq(AlarmRecipientGroup::getTenantId, tenantId)
                    .eq(AlarmRecipientGroup::getCode, code));
            if (count == null || count == 0) {
                return code;
            }
        }
        throw new BizException(ResultCode.INTERNAL_ERROR, "生成接收组编码失败，请重试");
    }

    private UserOptionVO toUserOption(User user) {
        UserOptionVO option = new UserOptionVO();
        option.setUsername(user.getUsername());
        option.setRealName(user.getRealName());
        option.setPhone(user.getPhone());
        option.setEmail(user.getEmail());
        option.setStatus(user.getStatus());
        return option;
    }

    private Long requireTenantId() {
        Long tenantId = AppContextHolder.getTenantId();
        if (tenantId == null || tenantId <= 0) {
            throw new BizException(ResultCode.PARAM_ERROR, "租户上下文缺失");
        }
        return tenantId;
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
