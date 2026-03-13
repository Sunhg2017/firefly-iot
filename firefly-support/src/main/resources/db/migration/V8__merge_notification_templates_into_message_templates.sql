DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = current_schema()
          AND table_name = 'notification_templates'
    ) THEN
        INSERT INTO message_templates (
            tenant_id,
            code,
            name,
            channel,
            template_type,
            subject,
            content,
            variables,
            enabled,
            description,
            created_at,
            updated_at
        )
        SELECT
            tenant_id,
            code,
            name,
            channel,
            CASE
                WHEN channel IN ('WECHAT', 'DINGTALK') THEN 'MARKDOWN'
                ELSE 'TEXT'
            END,
            subject,
            content,
            variables,
            enabled,
            'Migrated from legacy notification_templates',
            created_at,
            updated_at
        FROM notification_templates
        ON CONFLICT (tenant_id, code) DO NOTHING;
    END IF;
END $$;

DROP TABLE IF EXISTS notification_templates;
