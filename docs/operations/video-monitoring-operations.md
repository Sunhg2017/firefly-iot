# 视频监控模块运维说明

## 适用范围

本文档适用于 `视频监控` 页面、视频设备创建抽屉、实时播放抽屉，以及从摄像头产品页跳转到视频监控页的联动链路。

涉及模块：

- `firefly-common`
- `firefly-web`
- `firefly-media`
- `firefly-device`
- `ZLMediaKit`

## 部署与发布关注点

### 前端

- 构建命令：`npm run build`
- 关注页面：
  - `视频监控`
  - `添加视频设备` 抽屉
  - 从产品页进入时的产品上下文提示

### 后端

- 编译命令：`mvn -pl firefly-common,firefly-device,firefly-media -am -DskipTests compile`
- 关注接口：
  - `POST /api/v1/video/devices`
  - `POST /api/v1/video/devices/list`
  - `POST /api/v1/video/devices/{id}/start`
  - `POST /api/v1/video/devices/{id}/stop`
  - `POST /api/v1/video/devices/{id}/snapshot`

## 运行前检查

1. 确认 `firefly-media` 与 `ZLMediaKit` 都已启动。
2. 如果从摄像头产品页跳转进入视频监控，确认产品协议是 `GB28181 / RTSP / RTMP` 之一。
3. 确认当前前端版本已包含 `useSearchParams` 联动逻辑，能识别 `productKey / productName / protocol / autoCreate=1`。
4. 确认摄像头产品历史数据已执行：
   - `V22__force_camera_products_custom_data_format.sql`
   - `V23__normalize_camera_products_video_access_auth.sql`
5. 确认 `firefly-media` 已执行：
   - `V2__add_video_device_sip_password.sql`
   - `V3__enforce_video_device_identity_unique.sql`
   - `V4__add_video_device_source_url.sql`
   - `V5__refine_video_device_proxy_identity_unique.sql`
6. 若 GB28181 设备开启了 SIP 鉴权，确认页面已保存设备级 `SIP 密码`。
7. `sip_password` 只允许通过 `V2__add_video_device_sip_password.sql` 增量补齐，禁止改写已上线的 `V1__init_video.sql`，否则 Flyway 会因 checksum 不一致阻止服务启动。
8. 新建视频设备会同步调用 `firefly-device` 内部接口创建设备资产主设备；若 `firefly-device` 不可用或产品不存在，视频设备保存会直接失败。
9. 确认公共 Feign 上下文透传已生效，`firefly-media -> firefly-device` 需要携带 `X-Tenant-Id / X-User-Id / X-Granted-Permissions`，否则产品查询或设备资产创建可能落不到当前租户与数据权限范围。
10. 确认 Kafka 业务上下文传播已生效：
   - Producer 已注册 `KafkaAuthContextProducerInterceptor`
   - Listener 容器已注册 `KafkaAuthContextRecordInterceptor`
   - 消费端按记录恢复并清理 `AppContextHolder`，而不是复用整批 `poll` 线程上下文
11. 如果历史环境已经存在重复视频设备，先清理重复数据，再执行 `V3 / V5`；不要通过删除唯一索引继续容忍重复数据。

## 监控与日志

### 关键日志

- `firefly-common`
  - `KafkaAuthContextConfig`
- `firefly-media`
  - `VideoService`
  - `SipCommandSender`
  - `ZlmApiClient`
- `firefly-device`
  - `ProductService`

### 重点观察项

- 视频设备创建失败率是否异常升高。
- 从产品页跳转视频监控时，是否正确自动打开抽屉并锁定协议。
- `start / stop / snapshot` 接口是否连续报错。
- GB28181 设备是否按预期更新在线状态。

## 常见故障与排查

### 1. 从产品页跳到视频监控后没有自动打开抽屉

排查：

1. 检查跳转 URL 是否带上 `autoCreate=1`。
2. 检查前端版本是否已部署到包含产品联动的新版本。
3. 检查浏览器控制台是否存在 `Drawer` 或 `Form` 渲染错误。

### 2. 抽屉已打开，但接入方式没有锁定到产品协议

排查：

1. 检查 URL 中的 `protocol` 是否为 `GB28181 / RTSP / RTMP`。
2. 检查视频监控页是否被旧缓存覆盖。
3. 检查用户是否点击过“清空联动”按钮。

### 3. 摄像头产品仍提示 ProductSecret 或动态注册

排查：

1. 检查 `firefly-device` 是否已部署到摄像头认证收口版本。
2. 检查摄像头产品是否仍残留 `product_secret` 历史脏数据。
3. 若数据库仍残留旧值，应执行清理，不再继续叠加兼容逻辑。

### 4. 视频设备可以创建，但播放失败

排查：

1. 检查设备状态是否为 `ONLINE`。
2. 检查 `ZLMediaKit` 是否可访问。
3. GB28181 设备检查 SIP 注册、目录查询与设备信息查询是否成功。
4. RTSP / RTMP 设备优先检查完整 `sourceUrl` 是否正确，其次再看平台解析出来的 IP、端口和流媒体服务状态。

### 5. 从产品页进入后新建视频设备成功提示了，但列表里看不到

排查：

1. 检查 `firefly-device` 是否可用，确认视频设备创建时设备资产主设备也创建成功。
2. 检查 `video_devices.device_id` 是否已回填；如果为空，说明创建链路中断。
3. 检查对应 `devices.project_id` 是否为空或落错项目；当产品本身没有项目时，系统只会在当前数据范围恰好命中一个项目时自动补入该项目。
4. 检查 `device_group_members` 是否已写入当前可见静态分组；若用户是分组数据权限口径，主设备不在可见静态分组里会导致视频设备被过滤。
5. 检查动态分组是否已重算；若当前权限依赖动态分组，需确认建设备后是否已重新命中规则。
6. 检查 `firefly-media` 调用 `firefly-device` 时是否带上 `X-Tenant-Id / X-User-Id / X-Granted-Permissions`；若头丢失，可能出现保存成功但新建记录立即从列表消失。

### 6. GB28181 设备开启了 SIP 鉴权但仍提示认证失败

排查：

1. 确认视频设备记录里已保存 `SIP 密码`。
2. 确认设备端使用 `GB 设备编号` 作为 SIP 用户名。
3. 抓包或看平台日志，确认第一次 `REGISTER` 收到 `401 Unauthorized`，第二次带 `Authorization` 的 `REGISTER` 是否校验通过。
4. 如果仍失败，继续检查设备编号、域、传输协议、平台监听 IP/端口是否配置一致。

### 6.1 创建设备时提示 SIP 密码为空，但请求里已经带了值

排查：

1. 优先确认请求体字段名是否为 `sipPassword`，并核对请求体实际进入后端的 JSON。
2. 确认同时传入了 `sipAuthEnabled=true` 和 `gbDeviceId`。
3. 若页面仍提示成功但实际未创建，确认前端是否已部署到本次修复版本；当前版本会直接显示后端业务校验消息，不再吞掉 `R.code != 0` 的失败响应。

### 6.2 同一台视频设备可以重复创建

排查：

1. 检查 `firefly-media` 是否已执行 `V3__enforce_video_device_identity_unique.sql`。
2. 检查 `firefly-media` 是否已执行 `V5__refine_video_device_proxy_identity_unique.sql`。
3. 检查当前租户下是否已有重复历史数据；若有，先人工清理后再执行迁移。
4. 确认创建请求是否复用了同一个接入标识：
   - `GB28181` 看 `GB 设备编号`
   - `RTSP / RTMP` 优先看完整 `sourceUrl`
   - 只有没有 `sourceUrl` 的旧记录才看 `IP + 端口`
5. 若接口仍然成功创建两条记录，检查服务端是否已部署到包含 `VideoService` 预校验和 `sourceUrl` 唯一索引的新版本。

### 6.3 使用设备模拟器联调视频设备时报未登录或调用错环境

排查：

1. 确认模拟器左上角当前环境已经登录。
2. 确认模拟器当前环境 `mediaBaseUrl` 指向的就是待联调的 `firefly-media`。
3. 若刚切换环境，重新连接模拟器中的 Video 设备，确认没有沿用旧环境的 token。
4. 若平台上已经存在同一台视频设备，确认模拟器连接后走的是“同步更新”而不是“重复创建”。

### 7. Kafka 消费链路出现租户或用户上下文丢失

排查：

1. 检查消息头是否带有 `X-Tenant-Id / X-User-Id / X-Granted-Permissions`。
2. 检查服务启动日志里是否打印了 `Record interceptor registered on listener factory`。
3. 若消息体本身也包含 `tenantId / userId / operatorId`，确认 Consumer 侧是否按预期回退解析。
4. 如果同一消费线程连续处理不同租户消息，确认消费端是否使用逐条 `RecordInterceptor` 恢复上下文，而不是在批量 `ConsumerInterceptor` 中写死线程上下文。

## 回滚说明

如果本次视频监控联动改造需要回滚：

1. 回退前端文件：
   - `firefly-web/src/pages/video/VideoList.tsx`
   - `firefly-web/src/pages/product/ProductList.tsx`
   - `firefly-web/src/pages/product/ProductAccessDrawer.tsx`
2. 回退后端摄像头认证收口：
   - `firefly-device/src/main/java/com/songhg/firefly/iot/device/service/ProductService.java`
3. 同步回退文档：
   - `docs/design/detailed-design-video-monitoring.md`
   - `docs/operations/video-monitoring-operations.md`
   - `docs/user-guide/video-monitoring-guide.md`

注意：

- 回滚前需确认是否要保留 `V23__normalize_camera_products_video_access_auth.sql` 已清理的数据。
- 如果回滚代码但数据库已清空摄像头 `product_secret`，旧前端即使回退也不应再要求恢复旧口径。

## 验证建议

1. 从摄像头产品页点击 `视频接入`，确认跳转后自动打开“添加视频设备”抽屉。
2. 确认抽屉中的 `接入方式` 与产品协议一致，且处于锁定状态。
3. 新建一台视频设备，确认列表可见。
4. 对在线设备执行播放、截图、停止，确认接口调用成功。
5. 从摄像头产品页进入新建视频设备后，确认 `设备资产` 与 `视频监控` 两侧都能看到对应记录。
6. 使用带项目/分组数据权限的账号重复执行一次新建，确认新设备仍然可见。
7. 使用设备模拟器分别联调 `GB28181`、`RTSP`、`RTMP` 三种模式，确认能同步设备、开始推流、截图、录制和查询通道。
