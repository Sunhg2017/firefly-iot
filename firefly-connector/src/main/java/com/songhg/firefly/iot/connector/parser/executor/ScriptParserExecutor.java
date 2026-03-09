package com.songhg.firefly.iot.connector.parser.executor;

import com.github.benmanes.caffeine.cache.Cache;
import com.github.benmanes.caffeine.cache.Caffeine;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.parser.model.DownlinkEncodeContext;
import com.songhg.firefly.iot.connector.parser.model.EncodeExecutionResult;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ParseExecutionResult;
import jakarta.annotation.PreDestroy;
import lombok.extern.slf4j.Slf4j;
import org.graalvm.polyglot.Context;
import org.graalvm.polyglot.Engine;
import org.graalvm.polyglot.HostAccess;
import org.graalvm.polyglot.Source;
import org.springframework.stereotype.Component;

import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;

@Slf4j
@Component
public class ScriptParserExecutor {

    private static final String HELPER_SCRIPT = """
            const hex = Object.freeze({
              toBytes(str) {
                if (!str) return [];
                const normalized = String(str).replace(/\\s+/g, '');
                if (normalized.length % 2 !== 0) throw new Error('HEX length must be even');
                const bytes = [];
                for (let i = 0; i < normalized.length; i += 2) {
                  bytes.push(parseInt(normalized.substring(i, i + 2), 16));
                }
                return bytes;
              },
              fromBytes(bytes) {
                if (!bytes) return '';
                return Array.from(bytes, item => (Number(item) & 0xff).toString(16).padStart(2, '0')).join('').toUpperCase();
              }
            });
            const json = Object.freeze({
              parse(text) { return JSON.parse(text); },
              stringify(obj) { return JSON.stringify(obj); }
            });
            const bcd = Object.freeze({
              toInt(bytes) {
                if (!bytes) return 0;
                let value = '';
                for (const byte of bytes) {
                  const current = Number(byte) & 0xff;
                  value += ((current >> 4) & 0x0f).toString();
                  value += (current & 0x0f).toString();
                }
                return Number(value);
              }
            });
            const crc = Object.freeze({
              crc16modbus(bytes) {
                let crcValue = 0xFFFF;
                for (const item of (bytes || [])) {
                  crcValue ^= (Number(item) & 0xFF);
                  for (let i = 0; i < 8; i++) {
                    crcValue = (crcValue & 0x0001) !== 0 ? (crcValue >> 1) ^ 0xA001 : crcValue >> 1;
                  }
                }
                return crcValue & 0xFFFF;
              }
            });
            const __base64Alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
            const base64 = Object.freeze({
              encode(bytes) {
                const input = Array.from(bytes || [], item => Number(item) & 0xff);
                let output = '';
                for (let i = 0; i < input.length; i += 3) {
                  const b1 = input[i];
                  const b2 = i + 1 < input.length ? input[i + 1] : NaN;
                  const b3 = i + 2 < input.length ? input[i + 2] : NaN;
                  const triplet = (b1 << 16) | ((isNaN(b2) ? 0 : b2) << 8) | (isNaN(b3) ? 0 : b3);
                  output += __base64Alphabet[(triplet >> 18) & 0x3F];
                  output += __base64Alphabet[(triplet >> 12) & 0x3F];
                  output += isNaN(b2) ? '=' : __base64Alphabet[(triplet >> 6) & 0x3F];
                  output += isNaN(b3) ? '=' : __base64Alphabet[triplet & 0x3F];
                }
                return output;
              },
              decode(text) {
                const normalized = String(text || '').replace(/\\s+/g, '');
                if (!normalized) return [];
                let buffer = 0;
                let bits = 0;
                const output = [];
                for (const ch of normalized) {
                  if (ch === '=') break;
                  const index = __base64Alphabet.indexOf(ch);
                  if (index < 0) continue;
                  buffer = (buffer << 6) | index;
                  bits += 6;
                  if (bits >= 8) {
                    bits -= 8;
                    output.push((buffer >> bits) & 0xFF);
                  }
                }
                return output;
              }
            });
            """;
    private static final Source HELPER_SOURCE = Source.newBuilder(
            "js",
            HELPER_SCRIPT,
            "firefly-parser-helpers.js"
    ).cached(true).buildLiteral();
    private static final Source CONTEXT_SOURCE = Source.newBuilder(
            "js",
            "const ctx = JSON.parse(__ctxJson);",
            "firefly-parser-context.js"
    ).cached(true).buildLiteral();
    private static final Source INVOKE_SOURCE = Source.newBuilder(
            "js",
            """
                    JSON.stringify((function() {
                      if (typeof parse !== 'function') {
                        throw new Error('parse(ctx) must be defined');
                      }
                      return parse(ctx);
                    })())
                    """,
            "firefly-parser-invoke.js"
    ).cached(true).buildLiteral();
    private static final Source INVOKE_ENCODE_SOURCE = Source.newBuilder(
            "js",
            """
                    JSON.stringify((function() {
                      if (typeof encode !== 'function') {
                        throw new Error('encode(ctx) must be defined');
                      }
                      return encode(ctx);
                    })())
                    """,
            "firefly-encoder-invoke.js"
    ).cached(true).buildLiteral();

    private final ObjectMapper objectMapper;
    private final Engine engine = Engine.newBuilder()
            .option("engine.WarnInterpreterOnly", "false")
            .build();
    private final Cache<ScriptSourceCacheKey, Source> scriptSourceCache = Caffeine.newBuilder()
            .expireAfterAccess(Duration.ofMinutes(30))
            .maximumSize(1_000)
            .build();

    private final ExecutorService executorService = Executors.newCachedThreadPool(runnable -> {
        Thread thread = new Thread(runnable, "firefly-parser-script");
        thread.setDaemon(true);
        return thread;
    });

    public ScriptParserExecutor(ObjectMapper objectMapper) {
        this.objectMapper = objectMapper;
        warmUpEngine();
    }

    public ParseExecutionResult execute(ProtocolParserPublishedDTO definition, ParseContext context) {
        Future<ParseExecutionResult> future = executorService.submit(() -> doExecute(definition, context));
        try {
            int timeoutMs = definition.getTimeoutMs() == null ? 50 : definition.getTimeoutMs();
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            future.cancel(true);
            throw new IllegalStateException("Script parser execution timeout");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            throw new IllegalStateException("Script parser execution interrupted");
        } catch (ExecutionException ex) {
            throw unwrap(ex);
        }
    }

    public EncodeExecutionResult encode(ProtocolParserPublishedDTO definition, DownlinkEncodeContext context) {
        Future<EncodeExecutionResult> future = executorService.submit(() -> doEncode(definition, context));
        try {
            int timeoutMs = definition.getTimeoutMs() == null ? 50 : definition.getTimeoutMs();
            return future.get(timeoutMs, TimeUnit.MILLISECONDS);
        } catch (TimeoutException ex) {
            future.cancel(true);
            throw new IllegalStateException("Script encoder execution timeout");
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            future.cancel(true);
            throw new IllegalStateException("Script encoder execution interrupted");
        } catch (ExecutionException ex) {
            throw unwrap(ex);
        }
    }

    public void invalidate(Long definitionId) {
        if (definitionId == null) {
            return;
        }
        scriptSourceCache.asMap().keySet().removeIf(cacheKey -> definitionId.equals(cacheKey.definitionId()));
    }

    @PreDestroy
    public void shutdown() {
        executorService.shutdownNow();
        engine.close(true);
    }

    private ParseExecutionResult doExecute(ProtocolParserPublishedDTO definition, ParseContext context) {
        String contextJson = writeContextJson(context);
        try (Context jsContext = newContext()) {
            jsContext.getBindings("js").putMember("__ctxJson", contextJson);
            jsContext.eval(HELPER_SOURCE);
            jsContext.eval(CONTEXT_SOURCE);
            jsContext.eval(resolveScriptSource(definition));
            String resultJson = jsContext.eval(INVOKE_SOURCE).asString();
            if (resultJson == null || resultJson.isBlank() || "null".equals(resultJson)) {
                return new ParseExecutionResult();
            }
            return objectMapper.readValue(resultJson, ParseExecutionResult.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to deserialize parser result", ex);
        }
    }

    private EncodeExecutionResult doEncode(ProtocolParserPublishedDTO definition, DownlinkEncodeContext context) {
        String contextJson = writeContextJson(context);
        try (Context jsContext = newContext()) {
            jsContext.getBindings("js").putMember("__ctxJson", contextJson);
            jsContext.eval(HELPER_SOURCE);
            jsContext.eval(CONTEXT_SOURCE);
            jsContext.eval(resolveScriptSource(definition));
            String resultJson = jsContext.eval(INVOKE_ENCODE_SOURCE).asString();
            if (resultJson == null || resultJson.isBlank() || "null".equals(resultJson)) {
                return new EncodeExecutionResult();
            }
            return objectMapper.readValue(resultJson, EncodeExecutionResult.class);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to deserialize encoder result", ex);
        }
    }

    private Source resolveScriptSource(ProtocolParserPublishedDTO definition) {
        String scriptContent = definition.getScriptContent();
        if (scriptContent == null || scriptContent.isBlank()) {
            throw new IllegalArgumentException("Script parser content must not be blank");
        }
        ScriptSourceCacheKey cacheKey = new ScriptSourceCacheKey(
                definition.getDefinitionId(),
                definition.getVersionNo(),
                scriptContent
        );
        return scriptSourceCache.get(cacheKey, key -> Source.newBuilder(
                "js",
                key.scriptContent(),
                buildSourceName(key)
        ).cached(true).buildLiteral());
    }

    private String buildSourceName(ScriptSourceCacheKey cacheKey) {
        String definitionPart = cacheKey.definitionId() == null ? "draft" : String.valueOf(cacheKey.definitionId());
        String versionPart = cacheKey.versionNo() == null ? "current" : String.valueOf(cacheKey.versionNo());
        return "protocol-parser-" + definitionPart + "-v" + versionPart + ".js";
    }

    private void warmUpEngine() {
        try (Context jsContext = newContext()) {
            jsContext.getBindings("js").putMember("__ctxJson", "{}");
            jsContext.eval(HELPER_SOURCE);
            jsContext.eval(CONTEXT_SOURCE);
            jsContext.eval(Source.newBuilder(
                    "js",
                    "function parse(ctx) { return null; }",
                    "firefly-parser-warmup.js"
            ).cached(true).buildLiteral());
            jsContext.eval(INVOKE_SOURCE);
        } catch (Exception ex) {
            log.warn("Warm up script parser engine failed: {}", ex.getMessage());
        }
    }

    private Context newContext() {
        return Context.newBuilder("js")
                .engine(engine)
                .allowHostAccess(HostAccess.NONE)
                .allowHostClassLookup(className -> false)
                .allowCreateThread(false)
                .allowIO(false)
                .allowNativeAccess(false)
                .allowExperimentalOptions(true)
                .build();
    }

    private String writeContextJson(ParseContext context) {
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("protocol", context.getProtocol());
        model.put("transport", context.getTransport());
        model.put("topic", context.getTopic());
        model.put("payloadText", context.getPayloadText());
        model.put("payloadHex", context.getPayloadHex());
        model.put("headers", context.getHeaders() == null ? Map.of() : context.getHeaders());
        model.put("sessionId", context.getSessionId());
        model.put("remoteAddress", context.getRemoteAddress());
        model.put("productId", context.getProductId());
        model.put("productKey", context.getProductKey());
        model.put("config", context.getConfig() == null ? Map.of() : context.getConfig());
        model.put("payloadBytes", context.getPayload() == null ? java.util.List.of() : toByteList(context.getPayload()));
        try {
            return objectMapper.writeValueAsString(model);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize parser context", ex);
        }
    }

    private String writeContextJson(DownlinkEncodeContext context) {
        Map<String, Object> model = new LinkedHashMap<>();
        model.put("protocol", context.getProtocol());
        model.put("transport", context.getTransport());
        model.put("topic", context.getTopic());
        model.put("messageType", context.getMessageType());
        model.put("messageId", context.getMessageId());
        model.put("payload", context.getPayload() == null ? Map.of() : context.getPayload());
        model.put("timestamp", context.getTimestamp());
        model.put("tenantId", context.getTenantId());
        model.put("productId", context.getProductId());
        model.put("productKey", context.getProductKey());
        model.put("deviceId", context.getDeviceId());
        model.put("deviceName", context.getDeviceName());
        model.put("headers", context.getHeaders() == null ? Map.of() : context.getHeaders());
        model.put("sessionId", context.getSessionId());
        model.put("remoteAddress", context.getRemoteAddress());
        model.put("config", context.getConfig() == null ? Map.of() : context.getConfig());
        try {
            return objectMapper.writeValueAsString(model);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Failed to serialize encoder context", ex);
        }
    }

    private java.util.List<Integer> toByteList(byte[] payload) {
        java.util.List<Integer> list = new java.util.ArrayList<>(payload.length);
        for (byte value : payload) {
            list.add(value & 0xFF);
        }
        return list;
    }

    private RuntimeException unwrap(ExecutionException ex) {
        Throwable cause = ex.getCause();
        if (cause instanceof RuntimeException runtimeException) {
            return runtimeException;
        }
        return new IllegalStateException(cause == null ? ex.getMessage() : cause.getMessage(), cause);
    }

    private record ScriptSourceCacheKey(Long definitionId, Integer versionNo, String scriptContent) {
    }
}
