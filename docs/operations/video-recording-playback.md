# 视频历史回放 / 录像检索 / 录像下载运维说明

## 1. 部署方式

- 无新增中间件；录像元数据存于共享 PostgreSQL 的 `video_recordings`（由 `firefly-media` 的 Flyway `V8` 建表）。
- `deploy/deploy.sh prepare_zlm_config` 已自动在 ZLM `config.ini` 中启用 `[hook]` 并写入 `on_record_mp4=http://firefly-media:9040/api/v1/video/hook/on_record_mp4`。
- 需重启 `zlmediakit` 与 `firefly-media` 生效：

```bash
cd deploy
bash deploy.sh up
```

## 2. 前置依赖

- ZLMediaKit 需开启 MP4 录制（默认 `startRecord type=1` 即 MP4）；`on_publish` hook 对普通设备流返回 `enable_mp4=false`，录像由「实时播放 → 开始录像」按钮按需触发，非自动录制。
- `firefly-media` 需能访问 ZLM 的 `api.apiUrl`（`getMp4RecordFile` 拉取文件）与共享 PostgreSQL。

## 3. 监控与日志

- 录像元数据落库：`firefly-media` 日志 `Recording metadata persisted: inserted=...`。
- 录像下载失败：`ZLMediaKit 录像下载失败: status=...`。
- 无法解析归属的流：`Ignore on_record_mp4 because stream id is not a managed device stream: stream=...`（正常，本地摄像头流不录 MP4）。

## 4. 常见故障与排查

| 现象 | 可能原因 | 处置 |
| --- | --- | --- |
| 录像列表一直为空 | ZLM 未配置 `on_record_mp4` hook 或未重启 ZLM | 检查 `deploy/runtime/zlmediakit/config.ini` 的 `[hook] on_record_mp4`，重启 ZLM |
| 点「开始录像」后无录像 | 流未在录 / ZLM `record.filePath` 不可写 | 确认实时播放中再点录像；查 ZLM 日志与磁盘 |
| 回放 404 / 下载失败 | 录像文件被 ZLM 清理或路径不存在 | 核对 ZLM `record.fileSecond` 保留策略与磁盘 |
| 回放无法拖拽定位 | ZLM `getMp4RecordFile` 整文件流式返回，不支持 Range | 属已知限制，线性播放可用 |

## 5. 回滚

- 该能力为增量新增；回滚仅需回退 `firefly-media` 镜像与 `V8` 迁移（或直接停止使用录像接口），不影响实时播放/PTZ/截图等既有功能。
