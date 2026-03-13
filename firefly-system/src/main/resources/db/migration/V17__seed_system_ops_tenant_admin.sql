-- ============================================================
-- Seed built-in system operations tenant and super admin.
-- ============================================================

DO $$
DECLARE
    v_tenant_id BIGINT;
    v_role_id BIGINT;
    v_user_id BIGINT;
    v_admin_password_hash CONSTANT VARCHAR(256) := '$2a$12$ki73VrLhazNCVsvCEyb6xeMcch8KBOoL4X7CJGhbKCy3FknU/koSG';
BEGIN
    INSERT INTO tenants (
        code,
        name,
        display_name,
        description,
        plan,
        status,
        isolation_level,
        isolation_config,
        created_at,
        updated_at
    ) VALUES (
        'system-ops',
        'System Operations Tenant',
        '系统运维',
        'Built-in tenant for system operations workspace.',
        'ENTERPRISE',
        'ACTIVE',
        'SHARED_RLS',
        '{}'::jsonb,
        now(),
        now()
    )
    RETURNING id INTO v_tenant_id;

    INSERT INTO tenant_quotas (
        tenant_id,
        max_devices,
        max_msg_per_sec,
        max_rules,
        data_retention_days,
        max_ota_storage_gb,
        max_api_calls_day,
        max_users,
        max_projects,
        max_video_channels,
        max_video_storage_gb,
        max_share_policies,
        custom_config,
        updated_at
    ) VALUES (
        v_tenant_id,
        1000000,
        1000000,
        100000,
        3650,
        1024,
        100000000,
        100000,
        100000,
        100000,
        10240,
        100000,
        '{}'::jsonb,
        now()
    );

    INSERT INTO tenant_usage_realtime (
        tenant_id,
        device_count,
        device_online_count,
        current_msg_rate,
        rule_count,
        api_calls_today,
        ota_storage_bytes,
        video_channel_active,
        video_storage_bytes,
        user_count,
        project_count,
        share_policy_count,
        updated_at
    ) VALUES (
        v_tenant_id,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        now()
    );

    INSERT INTO roles (
        tenant_id,
        code,
        name,
        description,
        type,
        data_scope,
        is_system,
        status,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        'system_super_admin',
        '系统运维超级管理员',
        'Built-in super administrator role for system operations workspace.',
        'PRESET',
        'ALL',
        TRUE,
        'ACTIVE',
        now(),
        now()
    )
    RETURNING id INTO v_role_id;

    INSERT INTO role_permissions (role_id, permission, created_at)
    SELECT v_role_id, permission_code, now()
    FROM unnest(ARRAY[
        'dashboard:*',
        'tenant:*',
        'user:*',
        'role:*',
        'permission:*',
        'dict:*',
        'system:*',
        'notification:*',
        'apikey:*',
        'audit:*',
        'operation-log:*',
        'monitor:*',
        'export:*'
    ]::VARCHAR[]) AS permission_code;

    INSERT INTO users (
        tenant_id,
        username,
        password_hash,
        real_name,
        user_type,
        status,
        password_changed_at,
        login_fail_count,
        created_at,
        updated_at
    ) VALUES (
        v_tenant_id,
        'admin',
        v_admin_password_hash,
        'sys-admin',
        'SYSTEM_OPS',
        'ACTIVE',
        now(),
        0,
        now(),
        now()
    )
    RETURNING id INTO v_user_id;

    INSERT INTO user_roles (
        user_id,
        role_id,
        project_id,
        created_at
    ) VALUES (
        v_user_id,
        v_role_id,
        NULL,
        now()
    );

    UPDATE tenants
    SET admin_user_id = v_user_id,
        updated_at = now()
    WHERE id = v_tenant_id;
END $$;
