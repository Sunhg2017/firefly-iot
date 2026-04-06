# 协议接入模块深度测试与修复运维说明

## 1. 适用范围

本文档用于 `firefly-connector` 协议接入模块本轮深度测试后的发布、验证与排障。

覆盖协议：

- HTTP
- CoAP
- MQTT
- TCP/UDP 回归验证

## 2. 本次变更内容

- HTTP 认证在 token 签发失败时改为返回失败
- CoAP 认证在 token 签发失败时改为返回失败
- CoAP 未授权上报改为返回 `401`
- MQTT 外部 Broker ACL 从“全放行”收口为“仅允许自身 Topic”
- MQTT 上行回调收到异常数值头时改为安全降级，不再直接抛异常
- 新增 MQTT / CoAP / HTTP 定向回归测试

## 3. 验证步骤

执行后端测试：

```bash
mvn -pl firefly-connector -am test
```

建议联调验证：

1. 调用 HTTP 认证接口，模拟 token 签发失败场景，确认返回失败而不是 `token=null`
2. 调用 CoAP `/auth`，模拟 token 签发失败场景，确认返回失败
3. 使用失效 token 调用 CoAP `/property`、`/event` 或 `/ota/progress`，确认返回 `401`
4. 在外部 MQTT Broker 兼容模式下，用设备 A 尝试发布或订阅设备 B 的 `/sys/...` Topic，确认 ACL 返回 `deny`
5. 构造一条带异常 `deviceId/tenantId/productId` 头值的 MQTT 回调消息，确认 connector 只打印 warn，不出现 500 或线程中断
6. 回归 TCP/UDP 原有设备绑定与上行解析能力，确认仍可正常工作

## 4. 常见故障

### 4.1 HTTP / CoAP 认证改成失败后设备端报错更多

这是预期行为。旧版本只是把 token 签发失败伪装成成功，现在改为真实暴露故障，便于排查 RPC 或鉴权服务问题。

### 4.2 外部 MQTT Broker 兼容模式下 ACL 突然被拒绝

优先检查：

- `username` 是否仍按 `deviceName&productKey` 传递
- `clientId`、`username` 和 Topic 中的 `productKey/deviceName` 是否属于同一设备
- 是否误把公共 Topic 或其他设备 Topic 当成设备自有 Topic

### 4.3 MQTT 警告日志里出现 invalid header value

说明外部回调方传入了异常的 `deviceId/tenantId/productId`，当前实现会自动回退到设备身份解析，不会再直接中断处理。应继续排查回调侧字段生成逻辑。

## 5. 回滚说明

如需回滚，只需回滚 `firefly-connector` 本次代码。

回滚后会恢复以下旧问题：

- HTTP/CoAP token 下发失败仍伪装成功
- CoAP 未授权请求仍返回成功
- MQTT 外部 ACL 再次全放行
- MQTT 脏头值再次可能中断消息处理
