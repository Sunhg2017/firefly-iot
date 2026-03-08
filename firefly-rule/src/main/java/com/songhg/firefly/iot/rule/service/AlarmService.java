package com.songhg.firefly.iot.rule.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.TenantContextHolder;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.enums.AlarmStatus;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.mybatis.DataScope;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.rule.convert.AlarmConvert;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmProcessDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRecordQueryDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRecordVO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleCreateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleQueryDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleUpdateDTO;
import com.songhg.firefly.iot.rule.dto.alarm.AlarmRuleVO;
import com.songhg.firefly.iot.rule.entity.AlarmRecord;
import com.songhg.firefly.iot.rule.entity.AlarmRule;
import com.songhg.firefly.iot.rule.mapper.AlarmRecordMapper;
import com.songhg.firefly.iot.rule.mapper.AlarmRuleMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Slf4j
@Service
@RequiredArgsConstructor
public class AlarmService {

    private final AlarmRuleMapper alarmRuleMapper;
    private final AlarmRecordMapper alarmRecordMapper;

    // ==================== Alarm Rules ====================

    @Transactional
    public AlarmRuleVO createAlarmRule(AlarmRuleCreateDTO dto) {
        Long tenantId = TenantContextHolder.getTenantId();
        Long userId = UserContextHolder.getUserId();

        AlarmRule rule = AlarmConvert.INSTANCE.toRuleEntity(dto);
        rule.setTenantId(tenantId);
        rule.setEnabled(true);
        rule.setCreatedBy(userId);
        alarmRuleMapper.insert(rule);

        log.info("Alarm rule created: id={}, name={}, tenantId={}", rule.getId(), rule.getName(), tenantId);
        return AlarmConvert.INSTANCE.toRuleVO(rule);
    }

    public AlarmRuleVO getAlarmRuleById(Long id) {
        AlarmRule rule = alarmRuleMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.ALARM_RULE_NOT_FOUND);
        }
        return AlarmConvert.INSTANCE.toRuleVO(rule);
    }

    @DataScope
    public IPage<AlarmRuleVO> listAlarmRules(AlarmRuleQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
        Page<AlarmRule> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<AlarmRule> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AlarmRule::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(AlarmRule::getName, query.getKeyword());
        }
        if (query.getLevel() != null) {
            wrapper.eq(AlarmRule::getLevel, query.getLevel());
        }
        if (query.getEnabled() != null) {
            wrapper.eq(AlarmRule::getEnabled, query.getEnabled());
        }
        if (query.getProductId() != null) {
            wrapper.eq(AlarmRule::getProductId, query.getProductId());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(AlarmRule::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(AlarmRule::getCreatedAt);

        IPage<AlarmRule> result = alarmRuleMapper.selectPage(page, wrapper);
        return result.convert(AlarmConvert.INSTANCE::toRuleVO);
    }

    @Transactional
    public AlarmRuleVO updateAlarmRule(Long id, AlarmRuleUpdateDTO dto) {
        AlarmRule rule = alarmRuleMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.ALARM_RULE_NOT_FOUND);
        }
        AlarmConvert.INSTANCE.updateRuleEntity(dto, rule);
        alarmRuleMapper.updateById(rule);
        return AlarmConvert.INSTANCE.toRuleVO(rule);
    }

    @Transactional
    public void deleteAlarmRule(Long id) {
        AlarmRule rule = alarmRuleMapper.selectById(id);
        if (rule == null) {
            throw new BizException(ResultCode.ALARM_RULE_NOT_FOUND);
        }
        alarmRuleMapper.deleteById(id);
        log.info("Alarm rule deleted: id={}, name={}", id, rule.getName());
    }

    // ==================== Alarm Records ====================

    @DataScope
    public IPage<AlarmRecordVO> listAlarmRecords(AlarmRecordQueryDTO query) {
        Long tenantId = TenantContextHolder.getTenantId();
        Page<AlarmRecord> page = new Page<>(query.getPageNum(), query.getPageSize());

        LambdaQueryWrapper<AlarmRecord> wrapper = new LambdaQueryWrapper<>();
        wrapper.eq(AlarmRecord::getTenantId, tenantId);
        if (query.getKeyword() != null && !query.getKeyword().isBlank()) {
            wrapper.like(AlarmRecord::getTitle, query.getKeyword());
        }
        if (query.getLevel() != null) {
            wrapper.eq(AlarmRecord::getLevel, query.getLevel());
        }
        if (query.getStatus() != null) {
            wrapper.eq(AlarmRecord::getStatus, query.getStatus());
        }
        if (query.getProductId() != null) {
            wrapper.eq(AlarmRecord::getProductId, query.getProductId());
        }
        if (query.getDeviceId() != null) {
            wrapper.eq(AlarmRecord::getDeviceId, query.getDeviceId());
        }
        if (query.getProjectId() != null) {
            wrapper.eq(AlarmRecord::getProjectId, query.getProjectId());
        }
        wrapper.orderByDesc(AlarmRecord::getCreatedAt);

        IPage<AlarmRecord> result = alarmRecordMapper.selectPage(page, wrapper);
        return result.convert(AlarmConvert.INSTANCE::toRecordVO);
    }

    public AlarmRecordVO getAlarmRecordById(Long id) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        return AlarmConvert.INSTANCE.toRecordVO(record);
    }

    @Transactional
    public void confirmAlarmRecord(Long id) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        if (record.getStatus() != AlarmStatus.TRIGGERED) {
            throw new BizException(ResultCode.ALARM_STATUS_ERROR);
        }
        record.setStatus(AlarmStatus.CONFIRMED);
        record.setConfirmedBy(UserContextHolder.getUserId());
        record.setConfirmedAt(LocalDateTime.now());
        alarmRecordMapper.updateById(record);
        log.info("Alarm record confirmed: id={}", id);
    }

    @Transactional
    public void processAlarmRecord(Long id, AlarmProcessDTO dto) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        if (record.getStatus() != AlarmStatus.TRIGGERED && record.getStatus() != AlarmStatus.CONFIRMED) {
            throw new BizException(ResultCode.ALARM_STATUS_ERROR);
        }
        record.setStatus(AlarmStatus.PROCESSED);
        record.setProcessedBy(UserContextHolder.getUserId());
        record.setProcessedAt(LocalDateTime.now());
        if (dto != null && dto.getProcessRemark() != null) {
            record.setProcessRemark(dto.getProcessRemark());
        }
        alarmRecordMapper.updateById(record);
        log.info("Alarm record processed: id={}", id);
    }

    @Transactional
    public void closeAlarmRecord(Long id) {
        AlarmRecord record = alarmRecordMapper.selectById(id);
        if (record == null) {
            throw new BizException(ResultCode.ALARM_RECORD_NOT_FOUND);
        }
        record.setStatus(AlarmStatus.CLOSED);
        alarmRecordMapper.updateById(record);
        log.info("Alarm record closed: id={}", id);
    }
}
