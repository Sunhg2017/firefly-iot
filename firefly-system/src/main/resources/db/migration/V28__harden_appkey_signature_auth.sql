ALTER TABLE IF EXISTS api_keys
    ADD COLUMN IF NOT EXISTS secret_key_ciphertext TEXT;

COMMENT ON COLUMN api_keys.secret_key_ciphertext IS 'AppKey 签名密钥密文，仅服务端可解密用于 HMAC 验签';
