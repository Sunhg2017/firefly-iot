package com.songhg.firefly.iot.media.zlm;

import java.io.InputStream;

/**
 * ZLM 录像文件的流式下载句柄：调用方负责在消费完成后关闭 {@link #body()}。
 *
 * @param body          录像文件二进制流
 * @param contentLength 文件字节数，未知时为 -1
 */
public record ZlmMp4RecordDownload(InputStream body, long contentLength) {
}
