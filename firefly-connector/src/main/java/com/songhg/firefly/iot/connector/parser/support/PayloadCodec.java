package com.songhg.firefly.iot.connector.parser.support;

public final class PayloadCodec {

    private PayloadCodec() {
    }

    public static String toHex(byte[] payload) {
        if (payload == null || payload.length == 0) {
            return "";
        }
        StringBuilder builder = new StringBuilder(payload.length * 2);
        for (byte value : payload) {
            builder.append(String.format("%02X", value));
        }
        return builder.toString();
    }

    public static byte[] decodeHex(String value) {
        if (value == null) {
            return new byte[0];
        }
        String hex = value.replaceAll("\\s+", "");
        if (hex.isEmpty()) {
            return new byte[0];
        }
        if (hex.length() % 2 != 0) {
            throw new IllegalArgumentException("HEX payload length must be even");
        }
        byte[] result = new byte[hex.length() / 2];
        for (int i = 0; i < hex.length(); i += 2) {
            result[i / 2] = (byte) Integer.parseInt(hex.substring(i, i + 2), 16);
        }
        return result;
    }
}
