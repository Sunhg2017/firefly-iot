package com.songhg.firefly.iot.connector.parser.model;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class FrameDecodeResult {

    private boolean needMoreData;
    private List<byte[]> frames;

    public static FrameDecodeResult frames(List<byte[]> frames) {
        return FrameDecodeResult.builder()
                .needMoreData(false)
                .frames(frames == null ? List.of() : frames)
                .build();
    }

    public static FrameDecodeResult needMoreData() {
        return FrameDecodeResult.builder()
                .needMoreData(true)
                .frames(List.of())
                .build();
    }
}
