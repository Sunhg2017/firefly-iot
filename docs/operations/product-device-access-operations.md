# 产品设备接入运维说明

## 1. 适用范围

本文适用于：

- `firefly-web` 产品页设备接入抽屉
- 摄像头产品跳转到 `/device` 的联动
- `firefly-device` 摄像头产品认证口径
- `firefly-simulator` 联调时的产品上下文使用

## 2. 发布检查

### 前端

```bash
cd firefly-web
npm run build
```

### 后端

```bash
mvn -pl firefly-device,firefly-connector -am -DskipTests compile
```

## 3. 运行前检查

1. 摄像头产品协议必须为 `GB28181 / RTSP / RTMP`。
2. 产品页接入抽屉已部署到最新版本。
3. `/device` 页面已包含视频设备视图。
4. 独立 `/video` 路由已删除。

## 4. 验证项

1. 一机一密产品打开 `设备接入`，看到手动创建设备指引。
2. 一型一密产品打开 `设备接入`，可以动态注册。
3. 摄像头产品打开 `视频接入`，不再展示 `ProductSecret`。
4. 点击摄像头产品 `视频接入`，跳到 `/device` 并自动打开视频设备抽屉。
5. 抽屉内产品和协议回填正确。

## 5. 常见问题

### 5.1 摄像头产品仍然显示 ProductSecret

排查：

1. 检查前端版本是否最新。
2. 检查产品分类和协议是否正确。
3. 检查 `firefly-device` 是否已部署到摄像头认证收口版本。

### 5.2 点击视频接入后没有联动

排查：

1. 检查跳转 URL 是否带 `assetType=video` 和 `autoCreate=1`
2. 检查 `/device` 页面是否已接收并解析搜索参数
3. 检查浏览器是否仍缓存旧前端资源
