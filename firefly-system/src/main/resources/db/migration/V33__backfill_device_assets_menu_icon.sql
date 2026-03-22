UPDATE workspace_menu_catalog
SET icon = 'HddOutlined',
    updated_at = CURRENT_TIMESTAMP
WHERE workspace_scope = 'TENANT'
  AND menu_key = 'tenant-device-assets'
  AND icon IS DISTINCT FROM 'HddOutlined';
