package com.songhg.firefly.iot.support.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.baomidou.mybatisplus.core.metadata.IPage;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.songhg.firefly.iot.common.context.UserContextHolder;
import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskCreateDTO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskLogQueryDTO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskQueryDTO;
import com.songhg.firefly.iot.support.dto.scheduledtask.ScheduledTaskUpdateDTO;
import com.songhg.firefly.iot.support.entity.ScheduledTask;
import com.songhg.firefly.iot.support.entity.ScheduledTaskLog;
import com.songhg.firefly.iot.support.mapper.ScheduledTaskLogMapper;
import com.songhg.firefly.iot.support.mapper.ScheduledTaskMapper;
import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.context.ApplicationContext;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.scheduling.support.CronTrigger;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.lang.reflect.Method;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ScheduledFuture;

@Slf4j
@Service
@RequiredArgsConstructor
public class ScheduledTaskService {

    private final ScheduledTaskMapper taskMapper;
    private final ScheduledTaskLogMapper logMapper;
    private final ApplicationContext applicationContext;

    private final ThreadPoolTaskScheduler taskScheduler = new ThreadPoolTaskScheduler();
    private final Map<Long, ScheduledFuture<?>> runningTasks = new ConcurrentHashMap<>();

    // ==================== Init & Destroy ====================

    @PostConstruct
    public void init() {
        taskScheduler.setPoolSize(10);
        taskScheduler.setThreadNamePrefix("sched-task-");
        taskScheduler.setWaitForTasksToCompleteOnShutdown(true);
        taskScheduler.setAwaitTerminationSeconds(30);
        taskScheduler.initialize();

        List<ScheduledTask> enabledTasks = taskMapper.selectList(
                new LambdaQueryWrapper<ScheduledTask>().eq(ScheduledTask::getStatus, 1));
        for (ScheduledTask task : enabledTasks) {
            try {
                registerTask(task);
            } catch (Exception e) {
                log.error("Failed to register task on startup: id={}, name={}", task.getId(), task.getTaskName(), e);
            }
        }
        log.info("Scheduled task service initialized, {} tasks registered", enabledTasks.size());
    }

    @PreDestroy
    public void destroy() {
        runningTasks.values().forEach(f -> f.cancel(false));
        runningTasks.clear();
        taskScheduler.shutdown();
    }

    // ==================== CRUD ====================

    @Transactional
    public ScheduledTask create(ScheduledTaskCreateDTO dto) {
        validateCron(dto.getCronExpression());
        validateBean(dto.getBeanName(), dto.getMethodName());

        ScheduledTask task = new ScheduledTask();
        task.setTaskName(dto.getTaskName());
        task.setTaskGroup(dto.getTaskGroup() != null ? dto.getTaskGroup() : "DEFAULT");
        task.setCronExpression(dto.getCronExpression());
        task.setBeanName(dto.getBeanName());
        task.setMethodName(dto.getMethodName());
        task.setMethodParams(dto.getMethodParams());
        task.setStatus(dto.getStatus() != null ? dto.getStatus() : 1);
        task.setDescription(dto.getDescription());
        task.setMisfirePolicy(dto.getMisfirePolicy() != null ? dto.getMisfirePolicy() : 0);
        task.setCreatedBy(UserContextHolder.getUserId());
        taskMapper.insert(task);

        if (task.getStatus() == 1) {
            registerTask(task);
        }
        log.info("Scheduled task created: id={}, name={}, cron={}", task.getId(), task.getTaskName(), task.getCronExpression());
        return task;
    }

    @Transactional
    public ScheduledTask update(Long id, ScheduledTaskUpdateDTO dto) {
        ScheduledTask task = taskMapper.selectById(id);
        if (task == null) throw new BizException(ResultCode.NOT_FOUND, "定时任务不存在");

        boolean needReRegister = false;

        if (dto.getTaskName() != null) task.setTaskName(dto.getTaskName());
        if (dto.getTaskGroup() != null) task.setTaskGroup(dto.getTaskGroup());
        if (dto.getCronExpression() != null) {
            validateCron(dto.getCronExpression());
            task.setCronExpression(dto.getCronExpression());
            needReRegister = true;
        }
        if (dto.getBeanName() != null) {
            task.setBeanName(dto.getBeanName());
            needReRegister = true;
        }
        if (dto.getMethodName() != null) {
            task.setMethodName(dto.getMethodName());
            needReRegister = true;
        }
        if (dto.getMethodParams() != null) {
            task.setMethodParams(dto.getMethodParams());
            needReRegister = true;
        }
        if (dto.getDescription() != null) task.setDescription(dto.getDescription());
        if (dto.getMisfirePolicy() != null) task.setMisfirePolicy(dto.getMisfirePolicy());

        if (dto.getStatus() != null && !dto.getStatus().equals(task.getStatus())) {
            task.setStatus(dto.getStatus());
            needReRegister = true;
        }

        if (dto.getBeanName() != null && dto.getMethodName() != null) {
            validateBean(dto.getBeanName(), dto.getMethodName());
        }

        taskMapper.updateById(task);

        if (needReRegister) {
            unregisterTask(id);
            if (task.getStatus() == 1) {
                registerTask(task);
            }
        }

        log.info("Scheduled task updated: id={}, name={}", id, task.getTaskName());
        return task;
    }

    @Transactional
    public void delete(Long id) {
        ScheduledTask task = taskMapper.selectById(id);
        if (task == null) throw new BizException(ResultCode.NOT_FOUND, "定时任务不存在");
        unregisterTask(id);
        taskMapper.deleteById(id);
        log.info("Scheduled task deleted: id={}, name={}", id, task.getTaskName());
    }

    public ScheduledTask getById(Long id) {
        return taskMapper.selectById(id);
    }

    public IPage<ScheduledTask> list(ScheduledTaskQueryDTO query) {
        Page<ScheduledTask> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ScheduledTask> wrapper = new LambdaQueryWrapper<>();
        if (query.getTaskGroup() != null && !query.getTaskGroup().isBlank()) {
            wrapper.eq(ScheduledTask::getTaskGroup, query.getTaskGroup());
        }
        if (query.getStatus() != null) {
            wrapper.eq(ScheduledTask::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(ScheduledTask::getCreatedAt);
        return taskMapper.selectPage(page, wrapper);
    }

    // ==================== Enable / Disable ====================

    @Transactional
    public void enable(Long id) {
        ScheduledTask task = taskMapper.selectById(id);
        if (task == null) throw new BizException(ResultCode.NOT_FOUND, "定时任务不存在");
        if (task.getStatus() == 1) return;
        task.setStatus(1);
        taskMapper.updateById(task);
        registerTask(task);
        log.info("Scheduled task enabled: id={}", id);
    }

    @Transactional
    public void disable(Long id) {
        ScheduledTask task = taskMapper.selectById(id);
        if (task == null) throw new BizException(ResultCode.NOT_FOUND, "定时任务不存在");
        if (task.getStatus() == 0) return;
        task.setStatus(0);
        taskMapper.updateById(task);
        unregisterTask(id);
        log.info("Scheduled task disabled: id={}", id);
    }

    // ==================== Execute Once ====================

    public void executeOnce(Long id) {
        ScheduledTask task = taskMapper.selectById(id);
        if (task == null) throw new BizException(ResultCode.NOT_FOUND, "定时任务不存在");
        taskScheduler.execute(() -> executeTask(task));
        log.info("Scheduled task triggered manually: id={}, name={}", id, task.getTaskName());
    }

    // ==================== Execution Logs ====================

    public IPage<ScheduledTaskLog> listLogs(ScheduledTaskLogQueryDTO query) {
        Page<ScheduledTaskLog> page = new Page<>(query.getPageNum(), query.getPageSize());
        LambdaQueryWrapper<ScheduledTaskLog> wrapper = new LambdaQueryWrapper<>();
        if (query.getTaskId() != null) {
            wrapper.eq(ScheduledTaskLog::getTaskId, query.getTaskId());
        }
        if (query.getStatus() != null && !query.getStatus().isBlank()) {
            wrapper.eq(ScheduledTaskLog::getStatus, query.getStatus());
        }
        wrapper.orderByDesc(ScheduledTaskLog::getStartTime);
        return logMapper.selectPage(page, wrapper);
    }

    @Transactional
    public int cleanLogs(int days) {
        LocalDateTime threshold = LocalDateTime.now().minusDays(days);
        int count = logMapper.delete(new LambdaQueryWrapper<ScheduledTaskLog>()
                .lt(ScheduledTaskLog::getStartTime, threshold));
        if (count > 0) log.info("Cleaned {} scheduled task logs older than {} days", count, days);
        return count;
    }

    // ==================== Internal: register / unregister / execute ====================

    private void registerTask(ScheduledTask task) {
        try {
            CronTrigger trigger = new CronTrigger(task.getCronExpression());
            ScheduledFuture<?> future = taskScheduler.schedule(() -> executeTask(task), trigger);
            runningTasks.put(task.getId(), future);
            log.debug("Task registered: id={}, cron={}", task.getId(), task.getCronExpression());
        } catch (Exception e) {
            log.error("Failed to register task: id={}, cron={}", task.getId(), task.getCronExpression(), e);
        }
    }

    private void unregisterTask(Long taskId) {
        ScheduledFuture<?> future = runningTasks.remove(taskId);
        if (future != null) {
            future.cancel(false);
            log.debug("Task unregistered: id={}", taskId);
        }
    }

    private void executeTask(ScheduledTask task) {
        ScheduledTaskLog logEntry = new ScheduledTaskLog();
        logEntry.setTaskId(task.getId());
        logEntry.setTaskName(task.getTaskName());
        logEntry.setTaskGroup(task.getTaskGroup());
        logEntry.setBeanName(task.getBeanName());
        logEntry.setMethodName(task.getMethodName());
        logEntry.setMethodParams(task.getMethodParams());
        logEntry.setStartTime(LocalDateTime.now());

        try {
            Object bean = applicationContext.getBean(task.getBeanName());
            Method method;
            if (task.getMethodParams() != null && !task.getMethodParams().isBlank()) {
                method = bean.getClass().getMethod(task.getMethodName(), String.class);
                method.invoke(bean, task.getMethodParams());
            } else {
                method = bean.getClass().getMethod(task.getMethodName());
                method.invoke(bean);
            }

            logEntry.setEndTime(LocalDateTime.now());
            logEntry.setDurationMs(java.time.Duration.between(logEntry.getStartTime(), logEntry.getEndTime()).toMillis());
            logEntry.setStatus("SUCCESS");

            task.setLastExecTime(logEntry.getStartTime());
            task.setLastExecStatus("SUCCESS");
            task.setLastExecMessage(null);
            taskMapper.updateById(task);
        } catch (Exception e) {
            logEntry.setEndTime(LocalDateTime.now());
            logEntry.setDurationMs(java.time.Duration.between(logEntry.getStartTime(), logEntry.getEndTime()).toMillis());
            logEntry.setStatus("FAILED");
            String errorMsg = e.getCause() != null ? e.getCause().getMessage() : e.getMessage();
            logEntry.setErrorMessage(errorMsg);

            task.setLastExecTime(logEntry.getStartTime());
            task.setLastExecStatus("FAILED");
            task.setLastExecMessage(errorMsg);
            taskMapper.updateById(task);

            log.error("Scheduled task execution failed: id={}, name={}", task.getId(), task.getTaskName(), e);
        }

        try {
            logMapper.insert(logEntry);
        } catch (Exception e) {
            log.warn("Failed to insert task execution log: {}", e.getMessage());
        }
    }

    // ==================== Validation helpers ====================

    private void validateCron(String cron) {
        try {
            new CronTrigger(cron);
        } catch (IllegalArgumentException e) {
            throw new BizException(ResultCode.PARAM_ERROR, "无效的 Cron 表达式: " + cron);
        }
    }

    private void validateBean(String beanName, String methodName) {
        try {
            Object bean = applicationContext.getBean(beanName);
            boolean found = false;
            for (Method m : bean.getClass().getMethods()) {
                if (m.getName().equals(methodName)) {
                    found = true;
                    break;
                }
            }
            if (!found) {
                throw new BizException(ResultCode.PARAM_ERROR, "Bean '" + beanName + "' 中未找到方法 '" + methodName + "'");
            }
        } catch (org.springframework.beans.factory.NoSuchBeanDefinitionException e) {
            throw new BizException(ResultCode.PARAM_ERROR, "Spring Bean 不存在: " + beanName);
        }
    }
}
