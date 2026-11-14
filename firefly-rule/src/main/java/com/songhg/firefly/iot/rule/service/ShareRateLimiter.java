package com.songhg.firefly.iot.rule.service;

import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;

/**
 * 跨租户共享策略的调用频率控制。
 *
 * <p>使用 Redis 的原子自增实现按秒 QPS 与按自然日调用量限制，多实例部署时共享计数。
 * Redis 不可用时采用 fail-open 并记录告警：共享读取属于跨租户数据面，不能因为限流组件
 * 故障而整体不可用；此时限流暂时失效，由监控告警兜底。</p>
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class ShareRateLimiter {

    private static final String KEY_PREFIX = "firefly:share:rate:";
    private static final DateTimeFormatter DAY_FORMATTER = DateTimeFormatter.BASIC_ISO_DATE;

    private final StringRedisTemplate redisTemplate;

    public void check(Long policyId, SharePolicyRuleSupport.RateLimitConfig config) {
        if (policyId == null || config == null || config.isEmpty()) {
            return;
        }
        try {
            LocalDate today = LocalDate.now();
            if (config.dailyLimit() > 0) {
                String dailyKey = KEY_PREFIX + policyId + ":daily:" + today.format(DAY_FORMATTER);
                Long dailyCount = redisTemplate.opsForValue().increment(dailyKey);
                if (dailyCount != null && dailyCount == 1L) {
                    redisTemplate.expire(dailyKey, Duration.ofDays(2));
                }
                if (dailyCount != null && dailyCount > config.dailyLimit()) {
                    throw new BizException(ResultCode.SHARE_RATE_LIMITED,
                            "共享策略今日调用次数已达上限（" + config.dailyLimit() + " 次）");
                }
            }

            if (config.qps() > 0) {
                long epochSecond = System.currentTimeMillis() / 1000L;
                String qpsKey = KEY_PREFIX + policyId + ":qps:" + epochSecond;
                Long qpsCount = redisTemplate.opsForValue().increment(qpsKey);
                if (qpsCount != null && qpsCount == 1L) {
                    redisTemplate.expire(qpsKey, Duration.ofSeconds(2));
                }
                if (qpsCount != null && qpsCount > config.qps()) {
                    throw new BizException(ResultCode.SHARE_RATE_LIMITED,
                            "共享策略调用频率超过上限（" + config.qps() + " QPS）");
                }
            }
        } catch (BizException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("Share rate limit check failed, fail-open for policy {}: {}", policyId, ex.getMessage());
        }
    }
}
