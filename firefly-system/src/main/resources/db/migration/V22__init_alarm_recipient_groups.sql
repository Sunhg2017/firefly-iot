-- ============================================================
-- Alarm recipient groups for tenant-scoped alarm notification.
-- ============================================================

CREATE TABLE IF NOT EXISTS alarm_recipient_groups (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    code            VARCHAR(32) NOT NULL,
    name            VARCHAR(128) NOT NULL,
    description     VARCHAR(500),
    created_by      BIGINT,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_alarm_recipient_groups_code
    ON alarm_recipient_groups (tenant_id, code);
CREATE INDEX IF NOT EXISTS idx_alarm_recipient_groups_name
    ON alarm_recipient_groups (tenant_id, name);

CREATE TABLE IF NOT EXISTS alarm_recipient_group_members (
    id              BIGSERIAL PRIMARY KEY,
    tenant_id       BIGINT NOT NULL,
    group_id        BIGINT NOT NULL REFERENCES alarm_recipient_groups(id) ON DELETE CASCADE,
    user_id         BIGINT NOT NULL,
    created_at      TIMESTAMP NOT NULL DEFAULT now(),
    updated_at      TIMESTAMP NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uk_alarm_recipient_group_members_unique
    ON alarm_recipient_group_members (tenant_id, group_id, user_id);
CREATE INDEX IF NOT EXISTS idx_alarm_recipient_group_members_group
    ON alarm_recipient_group_members (tenant_id, group_id);

INSERT INTO tenant_menu_configs (
    tenant_id,
    parent_id,
    menu_key,
    label,
    icon,
    route_path,
    sort_order,
    visible,
    created_by,
    created_at,
    updated_at
)
SELECT
    alarm_rule_menu.tenant_id,
    alarm_rule_menu.parent_id,
    '/alarm-recipient-groups',
    '告警接收组',
    'TeamOutlined',
    '/alarm-recipient-groups',
    COALESCE((
        SELECT MAX(sibling.sort_order) + 1
        FROM tenant_menu_configs sibling
        WHERE sibling.tenant_id = alarm_rule_menu.tenant_id
          AND sibling.parent_id = alarm_rule_menu.parent_id
    ), alarm_rule_menu.sort_order + 1),
    alarm_rule_menu.visible,
    alarm_rule_menu.created_by,
    now(),
    now()
FROM tenant_menu_configs alarm_rule_menu
WHERE alarm_rule_menu.menu_key = '/alarm-rules'
  AND NOT EXISTS (
      SELECT 1
      FROM tenant_menu_configs existing
      WHERE existing.tenant_id = alarm_rule_menu.tenant_id
        AND existing.menu_key = '/alarm-recipient-groups'
  );
