package com.songhg.firefly.iot.system.service;

import com.songhg.firefly.iot.common.exception.BizException;
import com.songhg.firefly.iot.common.result.ResultCode;
import jakarta.annotation.PostConstruct;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

@Service
public class AppKeySecretCryptoService {

    private static final String ALGORITHM = "AES";
    private static final String TRANSFORMATION = "AES/GCM/NoPadding";
    private static final int KEY_LENGTH_BYTES = 32;
    private static final int IV_LENGTH_BYTES = 12;
    private static final int TAG_LENGTH_BITS = 128;

    private final SecureRandom secureRandom = new SecureRandom();

    @Value("${firefly.openapi.appkey.secret-encrypt-key:}")
    private String secretEncryptKey;

    private SecretKey secretKey;

    @PostConstruct
    public void init() {
        byte[] keyBytes = resolveKeyBytes(secretEncryptKey);
        if (keyBytes == null) {
            throw new IllegalStateException("firefly.openapi.appkey.secret-encrypt-key must be configured with 32-byte raw or base64 key");
        }
        this.secretKey = new SecretKeySpec(keyBytes, ALGORITHM);
    }

    public String encrypt(String rawSecret) {
        if (!StringUtils.hasText(rawSecret)) {
            throw new BizException(ResultCode.PARAM_ERROR, "app key secret is required");
        }
        try {
            byte[] iv = new byte[IV_LENGTH_BYTES];
            secureRandom.nextBytes(iv);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.ENCRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            byte[] encrypted = cipher.doFinal(rawSecret.trim().getBytes(StandardCharsets.UTF_8));

            byte[] payload = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, payload, 0, iv.length);
            System.arraycopy(encrypted, 0, payload, iv.length, encrypted.length);
            return Base64.getEncoder().encodeToString(payload);
        } catch (Exception e) {
            throw new BizException(ResultCode.INTERNAL_ERROR, "failed to encrypt app key secret");
        }
    }

    public String decrypt(String ciphertext) {
        if (!StringUtils.hasText(ciphertext)) {
            throw new BizException(ResultCode.UNAUTHORIZED, "app key secret is unavailable, recreate the app key");
        }
        try {
            byte[] payload = Base64.getDecoder().decode(ciphertext.trim());
            if (payload.length <= IV_LENGTH_BYTES) {
                throw new BizException(ResultCode.UNAUTHORIZED, "app key secret payload is invalid");
            }
            byte[] iv = Arrays.copyOfRange(payload, 0, IV_LENGTH_BYTES);
            byte[] encrypted = Arrays.copyOfRange(payload, IV_LENGTH_BYTES, payload.length);

            Cipher cipher = Cipher.getInstance(TRANSFORMATION);
            cipher.init(Cipher.DECRYPT_MODE, secretKey, new GCMParameterSpec(TAG_LENGTH_BITS, iv));
            return new String(cipher.doFinal(encrypted), StandardCharsets.UTF_8);
        } catch (BizException e) {
            throw e;
        } catch (Exception e) {
            throw new BizException(ResultCode.UNAUTHORIZED, "app key secret is invalid, recreate the app key");
        }
    }

    private byte[] resolveKeyBytes(String rawKey) {
        if (!StringUtils.hasText(rawKey)) {
            return null;
        }
        String normalized = rawKey.trim();

        try {
            byte[] decoded = Base64.getDecoder().decode(normalized);
            if (decoded.length == KEY_LENGTH_BYTES) {
                return decoded;
            }
        } catch (IllegalArgumentException ignored) {
            // Fallback to raw-text 32 byte key for local/dev configuration.
        }

        byte[] rawBytes = normalized.getBytes(StandardCharsets.UTF_8);
        return rawBytes.length == KEY_LENGTH_BYTES ? rawBytes : null;
    }
}
