package com.songhg.firefly.iot.media.zlm;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;

@Data
@JsonIgnoreProperties(ignoreUnknown = true)
public class ZlmStreamInfo {

    private String app;
    private String stream;
    private String schema;

    @JsonProperty("totalReaderCount")
    private Integer totalReaderCount;

    @JsonProperty("originType")
    private Integer originType;

    @JsonProperty("originUrl")
    private String originUrl;

    @JsonProperty("isRecording")
    private Boolean recording;
}
