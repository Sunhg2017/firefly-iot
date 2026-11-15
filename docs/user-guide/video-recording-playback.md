# 视频历史回放 / 录像检索 / 录像下载使用说明

## 1. 适用角色

- 视频监控运营人员：查看某台视频设备的历史录像、回放与下载。

## 2. 操作步骤

1. 进入「视频设备」列表，找到目标设备，点击行内「**录像**」按钮。
2. 抽屉中展示该设备的录像列表（文件名、开始时间、时长、大小、通道）。
3. 点击「**回放**」在弹窗中播放该段录像；点击「**下载**」下载 MP4 文件到本地。

> 录像来源：在「实时播放」抽屉中点击「开始录像」后产生的 MP4 切片；录像完成后自动进入录像列表。

## 3. 接口示例

录像检索：

```text
GET /MEDIA/api/v1/video/devices/42/recordings
```

响应（仅业务键，无数据库主键）：

```json
{ "code": 0, "data": [ { "fileName": "15-53-02.mp4", "fileSize": 1913597, "startTime": 1568965982000, "durationSeconds": 11.0, "channelId": "34020000001320000001" } ] }
```

回放 / 下载（浏览器经登录态请求，返回 MP4 流）：

```text
GET /MEDIA/api/v1/video/devices/42/recordings/play?fileName=15-53-02.mp4&startTime=1568965982000
GET /MEDIA/api/v1/video/devices/42/recordings/download?fileName=15-53-02.mp4&startTime=1568965982000
```

## 4. 注意事项与限制

1. 回放/下载需先「开始录像」产生录像文件；平台只做元数据检索，不自动清理 ZLM 磁盘文件。
2. 回放暂不支持拖拽定位（ZLM 整文件流式返回），可线性播放。
3. 只有具备 `video:read` 权限才能检索录像，`video:record` 权限才能回放/下载。
