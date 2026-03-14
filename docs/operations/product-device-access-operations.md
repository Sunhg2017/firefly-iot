# 产品设备接入优化运维说明

## 适用范围

本文适用于产品管理页“设备接入”入口及其依赖链路的运维、联调和故障排查。

涉及模块：

- `firefly-web`
- `firefly-connector`
- `firefly-device`
- `firefly-simulator`（联调时）

## 部署与发布关注点

### 前端

- 构建命令：`npm run build`
- 关注页面：
  - 产品管理
  - 设备接入抽屉

### 后端

- 编译命令：`mvn -pl firefly-connector -am -DskipTests compile`
- 关注接口：
  - `GET /api/v1/products/{id}/secret`
  - `POST /api/v1/protocol/device/register`
  - `POST /api/v1/protocol/http/auth`
  - `POST /api/v1/protocol/http/property/post`
  - `POST /api/v1/protocol/http/event/post`
  - `POST /api/v1/protocol/http/heartbeat`
  - `POST /api/v1/protocol/coap/auth`

## 运行前检查

1. 确认 `firefly-device` 与 `firefly-connector` 都已正常启动。
2. 确认产品的认证方式和发布状态正确。
3. 如果验证一型一密：
   - 产品必须是 `PRODUCT_SECRET`
   - 产品状态必须是 `PUBLISHED`
4. 如果验证协议说明：
   - MQTT / HTTP / CoAP 接口应与页面说明保持一致
   - 自定义协议需确认协议解析规则已配置

## 监控与日志

### 关键日志

- `firefly-connector`:
  - `DeviceRegisterController`
  - `DeviceAuthService`
  - `HttpProtocolAdapter`
  - `MqttProtocolAdapter`
  - `CoapProtocolAdapter`
- `firefly-device`:
  - `DeviceCredentialService`
  - `ProductService`

### 重点观察项

- 动态注册失败率是否异常升高。
- `PRODUCT_NOT_PUBLISHED`、`INVALID_PRODUCT_SECRET`、`DEVICE_NAME_EXISTS` 是否集中出现。
- HTTP 认证成功后，属性、事件、心跳接口是否稳定返回 200。

## 常见故障与排查

### 1. 页面看不到 ProductSecret

排查：

1. 检查产品认证方式是否为一型一密。
2. 检查 `GET /api/v1/products/{id}/secret` 是否返回业务错误。
3. 检查 `ProductService#getProductSecret` 日志和产品数据。

### 2. 动态注册按钮不可用

排查：

1. 检查产品状态是否为 `PUBLISHED`。
2. 检查产品认证方式是否为 `PRODUCT_SECRET`。
3. 检查页面提示是否为“仅可预览接入参数”而不是前端故障。

### 3. 动态注册返回失败

常见错误：

- `PRODUCT_NOT_PUBLISHED`
- `INVALID_PRODUCT_SECRET`
- `DEVICE_NAME_EXISTS`
- `INVALID_DEVICE_NAME`

排查：

1. 检查请求体中的 `productKey / productSecret / deviceName`。
2. 检查 `DeviceCredentialService#dynamicRegister` 日志。
3. 检查同产品下是否已有相同 `deviceName`。

### 4. HTTP 接入调试失败

排查：

1. 确认设备先成功调用 `/api/v1/protocol/http/auth`。
2. 确认后续请求携带 `X-Device-Token`。
3. 检查 token 是否过期或设备未完成动态注册。

## 回滚说明

如果本次改造需要回滚：

1. 回退前端产品管理页相关改动。
2. 回退 `DeviceRegisterController` 的对外响应字段。
3. 同步回退模拟器中的动态注册解析口径。

注意：

- 回滚后前端会重新展示分散入口。
- 如果已有自动化脚本按新响应字段消费，需要同时回退脚本或适配逻辑。

## 验证建议

建议至少执行以下验证：

1. 一机一密产品打开“设备接入”，确认看到手动创建设备指引。
2. 一型一密未发布产品打开“设备接入”，确认只能预览、不能动态注册。
3. 一型一密已发布产品完成一次动态注册，确认返回 `productKey / deviceName / deviceSecret`。
4. HTTP 产品按页面说明完成认证、属性上报和心跳调用。
