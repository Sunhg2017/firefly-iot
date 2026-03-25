# 产品设备接入优化运维说明

## 适用范围

本文适用于产品接入页“设备接入”入口及其依赖链路的运维、联调和故障排查。

涉及模块：

- `firefly-web`
- `firefly-connector`
- `firefly-device`
- `firefly-media`
- `firefly-simulator`（联调时）

## 部署与发布关注点

### 前端

- 构建命令：`npm run build`
- 关注页面：
  - 产品接入
  - 设备接入抽屉
  - 视频监控
  - 添加视频设备抽屉

### 后端

- 编译命令：`mvn -pl firefly-connector -am -DskipTests compile`
- 关注接口：
  - `GET /api/v1/products/{id}/secret`
  - `POST /api/v1/protocol/device/register`
  - `POST /api/v1/video/devices`
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
   - 产品状态可以是 `DEVELOPMENT` 或 `PUBLISHED`
4. 如果验证摄像头产品：
   - 产品分类必须是 `CAMERA`
   - 产品协议必须是 `GB28181 / RTSP / RTMP`
   - `V23__normalize_camera_products_video_access_auth.sql` 已执行，历史摄像头产品不再残留 `product_secret`
5. 如果验证协议说明：
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
- `INVALID_PRODUCT_SECRET`、`DEVICE_NAME_EXISTS` 是否集中出现。
- HTTP 认证成功后，属性、事件、心跳接口是否稳定返回 200。
- 摄像头产品跳转视频监控时，是否正确锁定协议并自动打开添加抽屉。

## 常见故障与排查

### 1. 页面看不到 ProductSecret

排查：

1. 检查产品认证方式是否为一型一密。
2. 检查 `GET /api/v1/products/{id}/secret` 是否返回业务错误。
3. 检查 `ProductService#getProductSecret` 日志和产品数据。

### 2. 动态注册按钮不可用

排查：

1. 检查产品认证方式是否为 `PRODUCT_SECRET`。
2. 检查前端版本是否仍保留“必须已发布”的旧限制。
3. 检查页面提示是否为“仅可预览接入参数”而不是前端故障。

### 3. 动态注册返回失败

常见错误：

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

### 5. 摄像头产品仍能查看 ProductSecret

排查：

1. 检查 `firefly-device` 是否已部署到包含摄像头认证收口的版本。
2. 检查 `V23__normalize_camera_products_video_access_auth.sql` 是否执行成功。
3. 检查数据库中摄像头产品是否仍残留 `device_auth_type = PRODUCT_SECRET` 或非空 `product_secret`。

### 6. 从产品跳到视频监控后没有自动锁定协议

排查：

1. 检查前端跳转 URL 是否带上 `productKey / productName / protocol / autoCreate=1`。
2. 检查视频监控页前端版本是否已包含 `useSearchParams` 联动逻辑。
3. 如果页面已打开但未自动弹出抽屉，检查浏览器控制台是否存在 `Form` 或 `Drawer` 渲染错误。

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
2. 一型一密开发中产品打开“设备接入”，确认可以执行动态注册。
3. 一型一密已发布产品完成一次动态注册，确认返回 `productKey / deviceName / deviceSecret`。
4. 摄像头产品打开“视频接入”，确认页面显示“视频协议接入”，且不再展示 ProductSecret。
5. 从摄像头产品跳转到视频监控，确认自动打开添加抽屉并锁定产品协议。
6. HTTP 产品按页面说明完成认证、属性上报和心跳调用。
