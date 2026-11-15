-- ============================================================
-- 自定义看板表
--
-- 租户可保存多套「自定义看板 / 运营大屏」布局；layout 为 JSON 文本，
-- 前端按组件类型渲染（复用既有 dashboard 数据接口），后端不解析其内容。
-- ============================================================
CREATE TABLE IF NOT EXISTS custom_dashboards (
    id            BIGSERIAL PRIMARY KEY,
    tenant_id     BIGINT NOT NULL,
    slug          VARCHAR(24) NOT NULL,
    name          VARCHAR(128) NOT NULL,
    description   VARCHAR(512),
    layout        TEXT NOT NULL DEFAULT '[]',
    share_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    share_token   VARCHAR(64),
    created_by    BIGINT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uk_custom_dashboards_slug UNIQUE (tenant_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_custom_dashboards_tenant
    ON custom_dashboards(tenant_id, updated_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS uk_custom_dashboards_share_token
    ON custom_dashboards(share_token)
    WHERE share_token IS NOT NULL;
