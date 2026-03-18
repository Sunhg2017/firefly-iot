# 产品物模型固有默认项运维说明
> 模块: `firefly-device` / `firefly-web`
> 日期: 2026-03-18
> 状态: Done

## 1. 适用范围

用于产品物模型固有默认项的发布验证、日常巡检和故障排查。

## 2. 本次变更

- 产品物模型现在固定包含默认属性 `ip`
- 产品物模型继续固定包含 `online`、`offline`、`heartbeat` 三个固有服务
- 后端读取、保存、导入物模型时都会自动补齐这些固有默认项
- 前端物模型抽屉不允许删除、修改、复制或拖拽这些固有默认项

## 3. 发布影响

本次无数据库结构变更，无需执行额外 Flyway SQL。

对已有产品的影响：

- 老数据不会立刻批量回写数据库
- 但通过接口读取、编辑或导入物模型时，会自动返回或落库带 `ip` 和固有服务的版本

## 4. 验证步骤

### 4.1 后端验证

```bash
mvn -pl firefly-device -Dtest=ProductServiceTest test
```

验证点：

1. 新建产品后，默认物模型包含 `ip`
2. 读取旧物模型时，即使 `properties` 为空，也会自动补齐 `ip`
3. 更新物模型时，自定义同名 `ip` 不会覆盖系统默认定义
4. 生命周期服务仍然会被自动补齐

### 4.2 前端验证

```bash
cd firefly-web
npm run build
```

验证点：

1. 打开产品物模型抽屉后，属性页首部可见 `ip`
2. `ip` 显示“固有属性”标签，且编辑、复制、删除按钮不可用
3. 服务页仍可见三个固有服务
4. JSON 清空 `ip` 后点击格式化或保存，页面仍会恢复 `ip`

## 5. 故障排查

### 5.1 产品物模型返回时没有 `ip`

优先检查：

- `firefly-device` 是否已部署包含本次改动的版本
- 产品物模型接口是否走的是 `/api/v1/products/{id}/thing-model`
- 返回体是否被旧网关、旧前端包或缓存覆盖

### 5.2 `ip` 被保存成了自定义定义

优先检查：

- 后端是否已启用 `ThingModelBuiltinDefinitionSupport`
- 是否存在绕过 `ProductService` 直接写库的脚本或临时工具

### 5.3 前端仍能修改或删除 `ip`

优先检查：

- `firefly-web` 是否使用了最新构建产物
- 浏览器是否仍缓存旧静态资源
- 页面加载的是否是正确租户空间下的产品物模型抽屉

## 6. 回滚说明

如需回滚，应同时回滚以下文件，保持前后端口径一致：

- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ProductService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelImportService`
- `firefly-device/src/main/java/com/songhg.firefly.iot.device.service.ThingModelBuiltinDefinitionSupport`
- `firefly-device/src/test/java/com/songhg.firefly.iot.device.service.ProductServiceTest`
- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`

回滚后需要注意：

- 新建产品默认将不再自动带 `ip`
- 老产品读取时可能再次出现 `properties` 为空的情况
