-- ============================================================
-- 下行消息持久化 outbox
--
-- 下行消息在发布到 Kafka 前先落库，作为持久化投递的权威来源：
--   - PENDING：待投递，重试任务按退避策略重新发布到 device.message.down；
--   - DELIVERED：connector 回执（device.message.down.ack）后置为已投递；
--   - FAILED：达到最大重试次数仍未投递，保留错误原因供排障。
-- ============================================================
CREATE TABLE IF NOT EXISTS downlink_outbox (
    id             BIGSERIAL PRIMARY KEY,
    tenant_id      BIGINT NOT NULL,
    device_id      BIGINT NOT NULL,
    message_id     VARCHAR(128) NOT NULL,
    type           VARCHAR(32),
    topic          VARCHAR(256),
    payload        TEXT NOT NULL,
    status         VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    attempts       INT NOT NULL DEFAULT 0,
    max_attempts   INT NOT NULL DEFAULT 5,
    next_retry_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_error     VARCHAR(512),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_downlink_outbox_message UNIQUE (device_id, message_id)
);

CREATE INDEX IF NOT EXISTS idx_downlink_outbox_retry
    ON downlink_outbox(status, next_retry_at);
