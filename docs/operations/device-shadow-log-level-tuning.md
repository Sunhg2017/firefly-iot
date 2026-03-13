# 设备影子上报日志级别收敛运维说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 适用场景

用于处理日志中频繁出现如下信息并导致刷屏的情况：

`Device shadow reported updated: deviceId=..., version=...`

## 2. 修复内容

- 设备影子 reported 成功更新日志已从 `INFO` 调整为 `DEBUG`。
- 生产环境在默认 `INFO` 级别下，不再持续输出这类高频正常日志。
- 影子更新失败、序列化失败等异常日志仍会保留。

## 3. 验证步骤

```bash
cd firefly-device
mvn test
```

运行验证：

1. 重启 `firefly-device`。
2. 让设备持续上报属性。
3. 确认默认 `INFO` 日志下不再频繁出现 `Device shadow reported updated`。
4. 如需排查影子写入细节，可临时将该类日志级别调到 `DEBUG`。

## 4. 运维建议

- 高并发设备上报场景中，应优先避免在正常成功路径输出逐条 `INFO` 日志。
- 如果后续仍出现影子相关日志刷屏，继续检查是否有其他高频成功日志沿用 `INFO` 级别。
