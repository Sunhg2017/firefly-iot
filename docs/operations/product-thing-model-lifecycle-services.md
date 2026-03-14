# 产品物模型固有生命周期服务运维说明

> 模块: `firefly-device` / `firefly-web`
> 日期: 2026-03-14
> 状态: Done

## 1. 适用范围

用于产品物模型生命周期服务的日常巡检、问题排查和发布验证。

## 2. 本次变更

- 产品物模型现在会强制包含 `online`、`offline`、`heartbeat` 三个固有服务。
- 后端读取、保存、导入物模型时都会自动补齐这三个服务。
- 前端物模型抽屉页不再允许删除或修改这三个固有服务。
- 设备消息页调用服务时会按设备所属产品自动加载服务选项。

## 3. 发布影响

本次无数据库结构变更，无需执行额外迁移脚本。

对已有产品的影响：

- 旧数据不会立即批量回写数据库。
- 但通过接口读取、编辑或导入物模型时，会自动返回或落库带固有服务的版本。

## 4. 验证步骤

### 4.1 后端验证

```bash
mvn -pl firefly-device -Dtest=ProductServiceTest test
```

验证点：

1. 新建产品后，默认物模型包含 `online/offline/heartbeat`。
2. 读取旧物模型时，即使库中 `services` 为空，也会自动补齐。
3. 更新物模型时，固有服务不会被自定义同名服务覆盖。

### 4.2 前端验证

```bash
cd firefly-web
npm run build
```

验证点：

1. 产品物模型抽屉打开后，服务页首部可见三个固有服务。
2. 固有服务的编辑、复制、删除按钮不可用。
3. 设备消息页选择设备后，可自动加载所属产品服务列表。

## 5. 故障排查

### 5.1 产品物模型返回时仍看不到固有服务

优先检查：

- `firefly-device` 是否已部署到包含本次改动的版本。
- 产品接口是否走的是 `/api/v1/products/{id}/thing-model`。
- 返回体是否被网关、缓存或前端旧包覆盖。

### 5.2 固有服务被保存成了其他定义

优先检查：

- 后端是否已启用 `ThingModelBuiltinServiceSupport`。
- 是否存在绕过 `ProductService` 直接写库的管理脚本或临时工具。

### 5.3 设备消息页没有加载到服务下拉

优先检查：

- 设备列表接口返回中是否包含 `productId`。
- 产品物模型接口是否正常返回字符串内容。
- 浏览器控制台是否有前端请求失败或权限错误。

## 6. 回滚说明

如需回滚，应同时回滚以下文件，保持前后端口径一致：

- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ProductService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelImportService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelBuiltinServiceSupport`
- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`
- `firefly-web/src/pages/device-message/DeviceMessagePage.tsx`

回滚后需注意：

- 前端可能再次允许删除固有服务。
- 老产品物模型再次可能出现 `services` 为空的情况。
