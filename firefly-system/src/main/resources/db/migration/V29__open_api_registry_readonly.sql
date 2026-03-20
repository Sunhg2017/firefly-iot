DELETE FROM workspace_menu_permission_catalog
WHERE workspace_scope = 'PLATFORM'
  AND menu_key = 'open-api'
  AND permission_code IN ('openapi:create', 'openapi:update', 'openapi:delete');

DELETE FROM permission_resources
WHERE code IN ('openapi:create', 'openapi:update', 'openapi:delete');

DELETE FROM role_permissions
WHERE permission IN ('openapi:create', 'openapi:update', 'openapi:delete');

UPDATE permission_resources
SET name = 'OpenAPI 目录',
    description = '查看由各微服务 @OpenApi 自动注册的 OpenAPI 目录',
    updated_at = now()
WHERE code = 'openapi:read';

UPDATE workspace_menu_permission_catalog
SET permission_label = '查看 OpenAPI 目录',
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_scope = 'PLATFORM'
  AND menu_key = 'open-api'
  AND permission_code = 'openapi:read';
