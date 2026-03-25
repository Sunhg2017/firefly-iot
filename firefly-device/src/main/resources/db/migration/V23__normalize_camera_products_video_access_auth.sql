UPDATE products
SET device_auth_type = 'DEVICE_SECRET',
    product_secret = NULL,
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'CAMERA'
  AND (device_auth_type IS DISTINCT FROM 'DEVICE_SECRET' OR product_secret IS NOT NULL);
