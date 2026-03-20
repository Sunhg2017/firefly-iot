# 产品物模型固有默认项运维说明
> 模块: `firefly-device` / `firefly-web`
> 日期: 2026-03-18
> 状态: Done

## 1. 适用范围

用于产品物模型固有默认项的发布验证、日常巡检和故障排查。

## 2. 本次变更

- 产品物模型固定包含默认属性 `ip`
- 产品物模型固定包含 `online`、`offline`、`heartbeat` 三个固有事件
- 后端读取、保存、导入物模型时都会自动补齐这些固有默认项
- 前端物模型抽屉不允许删除、修改、复制或拖拽这些固有默认项
- 设备消息页不再把 `online/offline/heartbeat` 当成可调用服务

## 3. 发布影响

本次无数据库结构变更，无需执行额外 Flyway SQL。

对已有产品的影响：

- 老数据不会立刻批量回写数据库
- 但通过接口读取、编辑或导入物模型时，会自动返回或落库带 `ip` 和固有事件的版本
- 旧口径中同名生命周期服务会在归一化后被移除

## 4. 验证步骤

### 4.1 后端验证

```bash
mvn -pl firefly-device -Dtest=ProductServiceTest test
```

验证点：

1. 新建产品后，默认物模型包含 `ip`
2. 新建产品后，事件列表包含 `online/offline/heartbeat`
3. 读取旧物模型时，即使 `properties/events/services` 为空，也会自动补齐默认项
4. 更新物模型时，自定义同名生命周期服务不会再保留下来

### 4.2 前端验证

```bash
cd firefly-web
npm run build
```

验证点：

1. 打开产品物模型抽屉后，属性页首部可见 `ip`
2. 事件页首部可见 `online/offline/heartbeat`
3. `ip` 显示“固有属性”标签，三个生命周期项显示“固有事件”标签
4. 服务页不再出现 `online/offline/heartbeat`
5. 编辑任一自定义属性、事件、服务时，弹层打开后会自动回填当前值；事件/服务的输入输出参数也会完整回填
6. 设备消息页服务调用下拉只显示产品自定义服务

## 5. 故障排查

### 5.1 产品物模型返回时没有 `ip` 或固有事件

优先检查：

- `firefly-device` 是否已部署包含本次改动的版本
- 产品物模型接口是否走的是 `/api/v1/products/{id}/thing-model`
- 返回体是否被旧网关、旧前端包或缓存覆盖

### 5.2 生命周期项仍出现在服务列表

优先检查：

- 后端是否已启用最新的 `ThingModelBuiltinDefinitionSupport`
- 前端是否仍缓存旧版静态资源
- 是否存在绕过 `ProductService` 直接写库的脚本或临时工具

### 5.3 设备消息页看不到可调用服务

优先检查：

- 当前产品是否真的维护了自定义 `services`
- 产品物模型接口返回的 `services` 是否为空
- 浏览器控制台是否有请求失败或权限错误

## 6. 回滚说明

如需回滚，应同时回滚以下文件，保持前后端口径一致：

- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ProductService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelImportService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelBuiltinDefinitionSupport`
- `firefly-device/src/test/java/com/songhg.firefly.iot.device.service.ProductServiceTest`
- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`
- `firefly-web/src/pages/device-message/DeviceMessagePage.tsx`

回滚后需要注意：

- 生命周期项会重新回到旧口径
- 设备消息页也会再次把生命周期项展示为服务
