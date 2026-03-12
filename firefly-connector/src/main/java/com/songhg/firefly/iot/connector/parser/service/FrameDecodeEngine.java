package com.songhg.firefly.iot.connector.parser.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.songhg.firefly.iot.api.dto.ProtocolParserPublishedDTO;
import com.songhg.firefly.iot.connector.config.TcpUdpProperties;
import com.songhg.firefly.iot.connector.parser.model.FrameDecodeResult;
import com.songhg.firefly.iot.connector.parser.model.KnownDeviceContext;
import com.songhg.firefly.iot.connector.parser.model.ParseContext;
import com.songhg.firefly.iot.connector.parser.model.ResolvedDeviceContext;
import com.songhg.firefly.iot.connector.parser.support.PayloadCodec;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.io.ByteArrayOutputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Slf4j
@Service
@RequiredArgsConstructor
public class FrameDecodeEngine {

    private static final int DEFAULT_MAX_FRAME_LENGTH = 65_536;
    private static final int DEFAULT_MAX_BUFFERED_BYTES = 65_536;

    private final ObjectMapper objectMapper;
    private final TcpUdpProperties tcpUdpProperties;
    private final PublishedProtocolParserService publishedProtocolParserService;
    private final ProtocolParserMatcher protocolParserMatcher;
    private final ProtocolParserReleaseMatcher protocolParserReleaseMatcher;
    private final FrameSessionBufferStore frameSessionBufferStore;

    public FrameDecodeResult decode(ParseContext parseContext, KnownDeviceContext knownDeviceContext) {
        if (!isTcp(parseContext.getTransport())) {
            return FrameDecodeResult.frames(List.of(payloadOrEmpty(parseContext.getPayload())));
        }
        Long productId = parseContext.getProductId() != null
                ? parseContext.getProductId()
                : knownDeviceContext == null ? null : knownDeviceContext.getProductId();
        if (productId == null) {
            return decodeLegacy(parseContext);
        }
        ResolvedDeviceContext releaseContext = toReleaseContext(parseContext, knownDeviceContext);
        ProtocolParserPublishedDTO definition = publishedProtocolParserService.getPublishedDefinitions(productId).stream()
                .filter(candidate -> protocolParserMatcher.matches(candidate, parseContext))
                .filter(candidate -> protocolParserReleaseMatcher.matches(candidate, releaseContext))
                .findFirst()
                .orElse(null);
        if (definition == null) {
            return decodeLegacy(parseContext);
        }
        return decode(definition, parseContext);
    }

    public FrameDecodeResult decode(ProtocolParserPublishedDTO definition, ParseContext parseContext) {
        if (!isTcp(parseContext.getTransport())) {
            return FrameDecodeResult.frames(List.of(payloadOrEmpty(parseContext.getPayload())));
        }

        String frameMode = definition == null ? "NONE" : upper(definition.getFrameMode());
        if (frameMode == null || frameMode.isBlank() || "NONE".equals(frameMode)) {
            clearSessionBuffer(parseContext);
            return FrameDecodeResult.frames(List.of(payloadOrEmpty(parseContext.getPayload())));
        }

        byte[] incoming = payloadOrEmpty(parseContext.getPayload());
        Map<String, Object> frameConfig = readJsonMap(definition == null ? null : definition.getFrameConfigJson());
        try {
            return switch (frameMode) {
                case "DELIMITER" -> decodeDelimiter(parseContext, incoming, frameConfig);
                case "FIXED_LENGTH" -> decodeFixedLength(parseContext, incoming, frameConfig);
                case "LENGTH_FIELD" -> decodeLengthField(parseContext, incoming, frameConfig);
                default -> {
                    log.debug("Unsupported frame mode for now: {}", frameMode);
                    clearSessionBuffer(parseContext);
                    yield FrameDecodeResult.frames(List.of(incoming));
                }
            };
        } catch (Exception ex) {
            log.warn("Frame decode failed: transport={}, sessionId={}, error={}",
                    parseContext.getTransport(), parseContext.getSessionId(), ex.getMessage());
            clearSessionBuffer(parseContext);
            return FrameDecodeResult.frames(List.of(incoming));
        }
    }

    private FrameDecodeResult decodeDelimiter(ParseContext parseContext,
                                              byte[] incoming,
                                              Map<String, Object> frameConfig) {
        byte[] delimiter = resolveDelimiter(frameConfig);
        if (delimiter.length == 0) {
            throw new IllegalArgumentException("delimiter or delimiterHex is required");
        }
        int maxBufferedBytes = resolveMaxBufferedBytes(frameConfig, DEFAULT_MAX_BUFFERED_BYTES);
        boolean stripDelimiter = getBoolean(frameConfig, "stripDelimiter", true);
        byte[] combined = mergeWithSession(parseContext, incoming, maxBufferedBytes);
        List<byte[]> frames = new ArrayList<>();
        int cursor = 0;
        int matchIndex;
        while ((matchIndex = indexOf(combined, delimiter, cursor)) >= 0) {
            int frameEnd = stripDelimiter ? matchIndex : matchIndex + delimiter.length;
            frames.add(copyRange(combined, cursor, frameEnd));
            cursor = matchIndex + delimiter.length;
        }
        boolean remainderStored = storeRemainder(parseContext, combined, cursor, maxBufferedBytes);
        return frames.isEmpty() ? noFramesResult(remainderStored) : FrameDecodeResult.frames(frames);
    }

    private FrameDecodeResult decodeFixedLength(ParseContext parseContext,
                                                byte[] incoming,
                                                Map<String, Object> frameConfig) {
        int fixedLength = getRequiredInt(frameConfig, "fixedLength", "frameLength");
        if (fixedLength <= 0) {
            throw new IllegalArgumentException("fixedLength must be greater than 0");
        }
        int maxBufferedBytes = resolveMaxBufferedBytes(frameConfig, DEFAULT_MAX_BUFFERED_BYTES);
        byte[] combined = mergeWithSession(parseContext, incoming, maxBufferedBytes);
        List<byte[]> frames = new ArrayList<>();
        int cursor = 0;
        while (combined.length - cursor >= fixedLength) {
            frames.add(copyRange(combined, cursor, cursor + fixedLength));
            cursor += fixedLength;
        }
        boolean remainderStored = storeRemainder(parseContext, combined, cursor, maxBufferedBytes);
        return frames.isEmpty() ? noFramesResult(remainderStored) : FrameDecodeResult.frames(frames);
    }

    private FrameDecodeResult decodeLengthField(ParseContext parseContext,
                                                byte[] incoming,
                                                Map<String, Object> frameConfig) {
        int lengthFieldOffset = getInt(frameConfig, "lengthFieldOffset", 0);
        int lengthFieldLength = getRequiredInt(frameConfig, "lengthFieldLength");
        int lengthAdjustment = getInt(frameConfig, "lengthAdjustment", 0);
        int initialBytesToStrip = getInt(frameConfig, "initialBytesToStrip", 0);
        int maxFrameLength = getInt(frameConfig, "maxFrameLength", DEFAULT_MAX_FRAME_LENGTH);
        int maxBufferedBytes = resolveMaxBufferedBytes(frameConfig, maxFrameLength);
        boolean littleEndian = "LITTLE_ENDIAN".equals(upper(getString(frameConfig, "byteOrder", "endian")));

        if (lengthFieldOffset < 0 || lengthFieldLength <= 0 || initialBytesToStrip < 0) {
            throw new IllegalArgumentException("Invalid length field config");
        }

        byte[] combined = mergeWithSession(parseContext, incoming, maxBufferedBytes);
        List<byte[]> frames = new ArrayList<>();
        int cursor = 0;
        while (true) {
            if (combined.length - cursor < lengthFieldOffset + lengthFieldLength) {
                break;
            }
            long payloadLength = readUnsignedNumber(combined, cursor + lengthFieldOffset, lengthFieldLength, littleEndian);
            long frameLengthLong = lengthFieldOffset + lengthFieldLength + payloadLength + lengthAdjustment;
            if (frameLengthLong <= 0 || frameLengthLong > Integer.MAX_VALUE) {
                throw new IllegalArgumentException("Invalid resolved frame length: " + frameLengthLong);
            }
            int frameLength = (int) frameLengthLong;
            if (frameLength > maxFrameLength) {
                throw new IllegalArgumentException("Frame length exceeds maxFrameLength: " + frameLength);
            }
            if (initialBytesToStrip > frameLength) {
                throw new IllegalArgumentException("initialBytesToStrip exceeds frame length");
            }
            if (combined.length - cursor < frameLength) {
                break;
            }
            frames.add(copyRange(combined, cursor + initialBytesToStrip, cursor + frameLength));
            cursor += frameLength;
        }
        boolean remainderStored = storeRemainder(parseContext, combined, cursor, maxBufferedBytes);
        return frames.isEmpty() ? noFramesResult(remainderStored) : FrameDecodeResult.frames(frames);
    }

    private FrameDecodeResult decodeLegacy(ParseContext parseContext) {
        String decoder = upper(tcpUdpProperties.getTcpFrameDecoder());
        if ("DELIMITER".equals(decoder)) {
            return decodeDelimiter(
                    parseContext,
                    payloadOrEmpty(parseContext.getPayload()),
                    Map.of("delimiter", tcpUdpProperties.getTcpDelimiter())
            );
        }
        if ("LENGTH".equals(decoder)) {
            return decodeLengthField(
                    parseContext,
                    payloadOrEmpty(parseContext.getPayload()),
                    Map.of(
                            "lengthFieldOffset", 0,
                            "lengthFieldLength", 4,
                            "initialBytesToStrip", 4,
                            "maxFrameLength", tcpUdpProperties.getMaxFrameLength()
                    )
            );
        }
        return decodeLine(parseContext, payloadOrEmpty(parseContext.getPayload()));
    }

    private FrameDecodeResult decodeLine(ParseContext parseContext, byte[] incoming) {
        int maxBufferedBytes = Math.max(DEFAULT_MAX_BUFFERED_BYTES, tcpUdpProperties.getMaxFrameLength());
        byte[] combined = mergeWithSession(parseContext, incoming, maxBufferedBytes);
        List<byte[]> frames = new ArrayList<>();
        int cursor = 0;
        for (int i = 0; i < combined.length; i++) {
            if (combined[i] != '\n') {
                continue;
            }
            int frameEnd = i > cursor && combined[i - 1] == '\r' ? i - 1 : i;
            frames.add(copyRange(combined, cursor, frameEnd));
            cursor = i + 1;
        }
        boolean remainderStored = storeRemainder(parseContext, combined, cursor, maxBufferedBytes);
        return frames.isEmpty() ? noFramesResult(remainderStored) : FrameDecodeResult.frames(frames);
    }

    private byte[] resolveDelimiter(Map<String, Object> frameConfig) {
        String delimiterHex = getString(frameConfig, "delimiterHex");
        if (delimiterHex != null && !delimiterHex.isBlank()) {
            return PayloadCodec.decodeHex(delimiterHex);
        }
        String delimiter = getString(frameConfig, "delimiter");
        if (delimiter == null) {
            return new byte[0];
        }
        return unescape(delimiter);
    }

    private byte[] mergeWithSession(ParseContext parseContext, byte[] incoming, int maxBufferedBytes) {
        String sessionKey = sessionKey(parseContext);
        byte[] previous = frameSessionBufferStore.get(sessionKey);
        if (previous == null || previous.length == 0) {
            return incoming;
        }
        long mergedLength = (long) previous.length + incoming.length;
        if (mergedLength > maxBufferedBytes) {
            throw new IllegalArgumentException("Frame session buffer exceeds maxBufferedBytes: " + mergedLength);
        }
        byte[] merged = new byte[previous.length + incoming.length];
        System.arraycopy(previous, 0, merged, 0, previous.length);
        System.arraycopy(incoming, 0, merged, previous.length, incoming.length);
        return merged;
    }

    private boolean storeRemainder(ParseContext parseContext,
                                   byte[] combined,
                                   int consumedLength,
                                   int maxBufferedBytes) {
        String sessionKey = sessionKey(parseContext);
        if (sessionKey == null) {
            return true;
        }
        int remaining = combined.length - consumedLength;
        if (remaining <= 0) {
            frameSessionBufferStore.clear(sessionKey);
            return true;
        }
        if (remaining > maxBufferedBytes) {
            // Protect connector memory from unbounded half-packet accumulation.
            frameSessionBufferStore.clear(sessionKey);
            log.warn("Discard oversized frame remainder: sessionId={}, remainingBytes={}, maxBufferedBytes={}",
                    parseContext.getSessionId(), remaining, maxBufferedBytes);
            return false;
        }
        frameSessionBufferStore.put(sessionKey, copyRange(combined, consumedLength, combined.length));
        return true;
    }

    private void clearSessionBuffer(ParseContext parseContext) {
        frameSessionBufferStore.clear(sessionKey(parseContext));
    }

    private String sessionKey(ParseContext parseContext) {
        if (parseContext == null) {
            return null;
        }
        String identity = firstNotBlank(parseContext.getSessionId(), parseContext.getRemoteAddress());
        if (identity == null) {
            return null;
        }
        return upper(parseContext.getTransport()) + ":" + identity;
    }

    private byte[] payloadOrEmpty(byte[] payload) {
        return payload == null ? new byte[0] : payload;
    }

    private FrameDecodeResult noFramesResult(boolean remainderStored) {
        return remainderStored ? FrameDecodeResult.needMoreData() : FrameDecodeResult.frames(List.of());
    }

    private int resolveMaxBufferedBytes(Map<String, Object> frameConfig, int fallbackValue) {
        int defaultValue = Math.max(Math.max(fallbackValue, tcpUdpProperties.getMaxFrameLength()), DEFAULT_MAX_BUFFERED_BYTES);
        int configured = getInt(frameConfig, "maxBufferedBytes", defaultValue);
        if (configured <= 0) {
            throw new IllegalArgumentException("maxBufferedBytes must be greater than 0");
        }
        return configured;
    }

    private ResolvedDeviceContext toReleaseContext(ParseContext parseContext, KnownDeviceContext knownDeviceContext) {
        if (knownDeviceContext == null) {
            return null;
        }
        return ResolvedDeviceContext.builder()
                .tenantId(knownDeviceContext.getTenantId())
                .productId(knownDeviceContext.getProductId())
                .deviceId(knownDeviceContext.getDeviceId())
                .deviceName(knownDeviceContext.getDeviceName())
                .productKey(firstNotBlank(
                        knownDeviceContext.getProductKey(),
                        parseContext == null ? null : parseContext.getProductKey()))
                .build();
    }

    private int indexOf(byte[] source, byte[] target, int fromIndex) {
        if (target.length == 0 || source.length < target.length) {
            return -1;
        }
        for (int i = Math.max(0, fromIndex); i <= source.length - target.length; i++) {
            boolean matched = true;
            for (int j = 0; j < target.length; j++) {
                if (source[i + j] != target[j]) {
                    matched = false;
                    break;
                }
            }
            if (matched) {
                return i;
            }
        }
        return -1;
    }

    private byte[] copyRange(byte[] source, int start, int end) {
        int actualStart = Math.max(0, start);
        int actualEnd = Math.max(actualStart, Math.min(source.length, end));
        byte[] result = new byte[actualEnd - actualStart];
        System.arraycopy(source, actualStart, result, 0, result.length);
        return result;
    }

    private long readUnsignedNumber(byte[] source, int offset, int length, boolean littleEndian) {
        if (length > 8) {
            throw new IllegalArgumentException("lengthFieldLength greater than 8 is not supported");
        }
        long value = 0;
        if (littleEndian) {
            for (int i = 0; i < length; i++) {
                value |= ((long) source[offset + i] & 0xFF) << (8 * i);
            }
            return value;
        }
        for (int i = 0; i < length; i++) {
            value = (value << 8) | ((long) source[offset + i] & 0xFF);
        }
        return value;
    }

    private byte[] unescape(String value) {
        ByteArrayOutputStream output = new ByteArrayOutputStream(value.length());
        for (int i = 0; i < value.length(); i++) {
            char ch = value.charAt(i);
            if (ch != '\\' || i == value.length() - 1) {
                byte[] encoded = String.valueOf(ch).getBytes(StandardCharsets.UTF_8);
                output.write(encoded, 0, encoded.length);
                continue;
            }
            char next = value.charAt(++i);
            switch (next) {
                case 'n' -> output.write('\n');
                case 'r' -> output.write('\r');
                case 't' -> output.write('\t');
                case '0' -> output.write(0);
                case '\\' -> output.write('\\');
                case 'x' -> {
                    if (i + 2 > value.length() - 1) {
                        throw new IllegalArgumentException("Invalid hex escape in delimiter");
                    }
                    String hex = value.substring(i + 1, i + 3);
                    output.write(Integer.parseInt(hex, 16));
                    i += 2;
                }
                default -> {
                    byte[] encoded = String.valueOf(next).getBytes(StandardCharsets.UTF_8);
                    output.write(encoded, 0, encoded.length);
                }
            }
        }
        return output.toByteArray();
    }

    private Map<String, Object> readJsonMap(String json) {
        if (json == null || json.isBlank()) {
            return new LinkedHashMap<>();
        }
        try {
            return objectMapper.readValue(json, new TypeReference<LinkedHashMap<String, Object>>() {});
        } catch (Exception ex) {
            log.warn("Parse frame config failed: {}", ex.getMessage());
            return new LinkedHashMap<>();
        }
    }

    private int getRequiredInt(Map<String, Object> config, String... keys) {
        for (String key : keys) {
            Object value = config.get(key);
            if (value != null) {
                return toInt(value, key);
            }
        }
        throw new IllegalArgumentException("Missing required frame config: " + String.join("/", keys));
    }

    private int getInt(Map<String, Object> config, String key, int defaultValue) {
        Object value = config.get(key);
        return value == null ? defaultValue : toInt(value, key);
    }

    private boolean getBoolean(Map<String, Object> config, String key, boolean defaultValue) {
        Object value = config.get(key);
        if (value == null) {
            return defaultValue;
        }
        if (value instanceof Boolean bool) {
            return bool;
        }
        return Boolean.parseBoolean(value.toString());
    }

    private String getString(Map<String, Object> config, String... keys) {
        for (String key : keys) {
            Object value = config.get(key);
            if (value != null) {
                String text = value.toString();
                if (!text.isEmpty()) {
                    return text;
                }
            }
        }
        return null;
    }

    private int toInt(Object value, String key) {
        if (value instanceof Number number) {
            return number.intValue();
        }
        try {
            return Integer.parseInt(value.toString());
        } catch (NumberFormatException ex) {
            throw new IllegalArgumentException("Invalid integer config for " + key);
        }
    }

    private boolean isTcp(String transport) {
        return "TCP".equals(upper(transport));
    }

    private String upper(String value) {
        return value == null ? null : value.trim().toUpperCase(Locale.ROOT);
    }

    private String firstNotBlank(String... values) {
        if (values == null) {
            return null;
        }
        for (String value : values) {
            if (value != null && !value.isBlank()) {
                return value;
            }
        }
        return null;
    }
}
