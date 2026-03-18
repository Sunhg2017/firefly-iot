ALTER TABLE devices
    DROP CONSTRAINT IF EXISTS uk_device_product_name;

DROP INDEX IF EXISTS uk_device_product_name;

CREATE UNIQUE INDEX IF NOT EXISTS uk_device_product_name_active
    ON devices (product_id, device_name)
    WHERE deleted_at IS NULL;
