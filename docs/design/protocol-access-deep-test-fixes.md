# 协议接入模块深度测试与修复设计

## 1. 背景

本次针对 `firefly-connector` 协议接入模块做了一轮面向生产风险的深度测试，重点覆盖：

- HTTP 接入
- CoAP Bridge 接入
- MQTT 外部 Broker 兼容回调
- TCP/UDP 现有回归链路

现有模块虽然已有部分 HTTP、TCP/UDP 单测，但 MQTT 与 CoAP 的关键异常路径覆盖明显不足，导致若干接入侧问题长期未被发现。

## 2. 测试策略

### 2.1 测试视角

本次按“协议认证、权限边界、异常输入、回调稳定性”四类风险组织测试：

- 认证成功后是否真的拿到可用凭证
- 未授权请求是否被错误放行
- 外部 Broker ACL 是否真正限制设备只访问自身 Topic
- 接入回调收到脏数据或异常头值时是否会中断整条链路

### 2.2 覆盖协议

- HTTP：认证、Token 签发异常
- CoAP：认证、属性上报未授权处理
- MQTT：ACL、上行消息头值稳健性
- TCP/UDP：执行回归，确认本轮改动未破坏既有能力

## 3. 发现的问题

### 3.1 HTTP 认证在 Token 签发失败时仍返回成功

位置：

- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/HttpProtocolAdapter.java`

问题：

- 设备认证成功后，如果 `issueToken()` 返回空值，接口仍返回 `code=0`
- 客户端会拿到 `token=null` 的伪成功响应，后续所有请求都会失败

影响：

- 设备端难以定位真实故障点
- 认证链路出现假成功，增加排障成本

### 3.2 CoAP Bridge 未授权上报仍返回成功

位置：

- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/CoapBridgeController.java`
- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/CoapProtocolAdapter.java`

问题：

- `property/event/ota/progress` 控制器无论 token 是否有效都直接返回 `R.ok()`
- 适配器内部只是写 warn 日志并提前返回

影响：

- 设备或代理网关无法识别 token 失效
- 会把真实未授权故障误判为平台已接收

### 3.3 CoAP 认证在 Token 签发失败时仍返回成功

位置：

- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/CoapBridgeController.java`

问题：

- 与 HTTP 类似，认证成功但 token 下发失败时仍返回成功响应

影响：

- 低功耗设备后续长时间使用无效 token 重试，问题发现更慢

### 3.4 MQTT 外部 Broker ACL 实际全放行

位置：

- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/MqttWebhookController.java`

问题：

- `/api/v1/protocol/mqtt/acl` 当前无论 topic 是否属于设备自身都会返回 `allow`

影响：

- 外部 MQTT Broker 兼容模式下，设备可越权访问其他设备 Topic
- 存在明显的协议接入安全风险

### 3.5 MQTT 上行回调对脏头值不稳健

位置：

- `firefly-connector/src/main/java/com/songhg/firefly/iot/connector/protocol/MqttProtocolAdapter.java`

问题：

- `deviceId/tenantId/productId` 头值直接 `Long.parseLong`
- 外部回调如果传入异常值，会直接触发 `NumberFormatException`

影响：

- 单条脏消息会打断整次解析和转发
- 无法退回到 `productKey + deviceName` 的 session 解析路径

## 4. 修复方案

### 4.1 收紧 HTTP/CoAP 认证成功条件

- `issueToken()` 返回空值时，直接返回 `TOKEN_ISSUE_FAILED`
- 不再向客户端返回 `token=null` 的伪成功结果

### 4.2 让 CoAP 控制器正确暴露未授权结果

- `CoapProtocolAdapter` 的处理方法改为返回认证结果
- `CoapBridgeController` 根据认证结果返回 `401 UNAUTHORIZED`

### 4.3 收口 MQTT ACL

- 只允许访问设备自身 `/sys/{productKey}/{deviceName}/#`
- `$SYS/` 仅允许读操作
- 非 `/sys/` 主题默认拒绝

### 4.4 MQTT 头值改为安全解析

- 新增安全数值解析逻辑
- 遇到脏头值时仅记录 warn，不中断消息处理
- 优先回退到 `resolveSession(productKey, deviceName)` 获取设备上下文

## 5. 回归测试

新增测试：

- `CoapBridgeControllerTest`
- `MqttProtocolAdapterTest`
- `MqttWebhookControllerTest`
- `HttpProtocolAdapterTest` 新增异常签发场景

本轮还执行了 `firefly-connector` 全量测试，确认 HTTP 生命周期、TCP/UDP、自定义协议解析等既有链路未回归。

## 6. 关键取舍

- MQTT ACL 直接按“仅允许自身 Topic”收口，不保留旧的全放行兼容口径。
- CoAP 控制器直接向调用方暴露未授权结果，不再继续吞掉错误。
- 脏头值处理选择“记录告警并继续回退解析”，避免单条异常消息放大为整条接入链路失败。
