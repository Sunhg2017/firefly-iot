CREATE UNIQUE INDEX IF NOT EXISTS uk_users_username_global
    ON users(username)
    WHERE deleted_at IS NULL;
