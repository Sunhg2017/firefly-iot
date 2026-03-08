-- ============================================================
-- 添加项目管理权限到权限分组
-- ============================================================
INSERT INTO permission_groups (code, name, permissions, sort_order) VALUES
('PROJECT_MGMT', '项目管理', '["project:create","project:read","project:update","project:delete","project:archive"]', 13)
ON CONFLICT (code) DO NOTHING;
