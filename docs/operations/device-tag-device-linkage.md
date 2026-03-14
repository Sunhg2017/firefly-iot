# 设备标签与设备主流程联动运维说明

## 适用范围

- `firefly-device`
- `firefly-web`

## 运行依赖

- 设备服务正常连接 PostgreSQL
- 前端可访问设备服务 `/api/v1/devices`、`/api/v1/device-tags`

## 数据依赖

核心表：

- `device_tags`
- `device_tag_bindings`
- `devices`

其中：

- `device_tag_bindings` 为真实绑定关系
- `devices.tags` 为快照字段，保存可读 JSON 数组

## 变更后行为

- 设备创建、编辑、批量导入时会同步维护标签绑定
- 删除设备时会自动移除其标签绑定
- 删除标签时会刷新相关设备快照
- 标签页绑定设备时会校验租户一致性和设备存在性

## 验证项

### 后端

执行：

```powershell
mvn -pl firefly-device -Dtest=DeviceTagServiceTest test
```

### 前端

执行：

```powershell
cd firefly-web
npm run build
```

## 常见排查

### 设备页看不到标签

检查：

- `device_tag_bindings` 是否存在对应记录
- 设备列表接口返回中是否包含 `tagList`
- 前端是否成功请求 `/DEVICE/api/v1/device-tags/all`

### 标签页无法绑定设备

检查：

- 当前租户下是否存在可选设备
- 当前登录用户是否具备 `device-tag:update` 与 `device:read`
- 设备是否已被逻辑删除

### 标签数量不准确

检查：

- `device_tags.device_count`
- 是否存在绕过 `DeviceTagService` 的直接写表操作

## 日志定位

关注模块：

- `com.songhg.firefly.iot.device.service.DeviceService`
- `com.songhg.firefly.iot.device.service.DeviceTagService`

重点现象：

- `Device not found`
- `Tag not found`
- `Some tags do not belong to current tenant`
- `Some devices do not belong to current tenant`

## 回滚说明

本次未引入新表结构，不涉及数据库回滚。

如需回滚：

- 回滚应用版本
- 前端回退到旧版设备页与标签页
- 数据表中既有标签绑定数据可保留
