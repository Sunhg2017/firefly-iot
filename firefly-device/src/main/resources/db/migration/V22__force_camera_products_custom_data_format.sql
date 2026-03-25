UPDATE products
SET data_format = 'CUSTOM',
    updated_at = CURRENT_TIMESTAMP
WHERE category = 'CAMERA'
  AND (data_format IS NULL OR data_format <> 'CUSTOM');
