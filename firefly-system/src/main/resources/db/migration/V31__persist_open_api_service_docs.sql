CREATE TABLE IF NOT EXISTS open_api_service_docs (
    id            BIGSERIAL PRIMARY KEY,
    service_code  VARCHAR(32) NOT NULL,
    api_doc_json  TEXT NOT NULL,
    synced_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uk_open_api_service_docs_service_code UNIQUE (service_code)
);

CREATE INDEX IF NOT EXISTS idx_open_api_service_docs_service_code
    ON open_api_service_docs (service_code);

COMMENT ON TABLE open_api_service_docs IS '各微服务最近一次同步到系统服务的 OpenAPI 文件快照';
COMMENT ON COLUMN open_api_service_docs.service_code IS '服务短码，如 SYSTEM/DEVICE';
COMMENT ON COLUMN open_api_service_docs.api_doc_json IS '该服务最近一次上报的完整 OpenAPI JSON 文件';
COMMENT ON COLUMN open_api_service_docs.synced_at IS '最近一次成功同步 OpenAPI 文件的时间';
