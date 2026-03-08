INSERT INTO permission_resources (
    parent_id,
    code,
    name,
    type,
    icon,
    path,
    sort_order,
    enabled,
    description
) VALUES (
    0,
    'dashboard:read',
    '工作台',
    'MENU',
    'DashboardOutlined',
    '/dashboard',
    5,
    TRUE,
    '查看工作台'
)
ON CONFLICT (code) DO NOTHING;
