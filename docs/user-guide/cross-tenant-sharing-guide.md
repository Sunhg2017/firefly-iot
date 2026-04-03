# 跨租户共享使用说明

## 适用角色

- 数据所有方租户管理员
- 数据消费者租户管理员

## 能力范围

当前跨租户共享支持：

- 创建、审批、驳回、撤销共享策略
- 查询共享给我的设备列表
- 按策略读取共享设备最新属性
- 按策略读取共享设备历史遥测
- 查看共享审计日志

当前不包含实时订阅消费页面。

## 所有方操作

### 1. 创建共享策略

页面入口：租户空间 `跨租户共享`

创建时需要至少配置：

- 消费方租户
- 共享范围
  - 至少填写一个 `productKey` 或 `deviceName`
- 数据权限
  - 若消费方需要看最新属性，必须开启 `properties`
  - 若消费方需要看历史遥测，必须开启 `telemetry` 或 `telemetryHistory.enabled`

示例：

```json
{
  "name": "共享电表基础数据",
  "consumerTenantId": 2002,
  "scope": {
    "productKeys": ["pk-meter"],
    "deviceNames": ["meter-01", "meter-02"]
  },
  "dataPermissions": {
    "properties": true,
    "telemetry": true,
    "telemetryHistory": {
      "enabled": true,
      "maxDays": 7
    }
  },
  "maskingRules": {
    "imei": "MASK_MIDDLE"
  }
}
```

### 2. 审批或驳回

- 新建策略默认为 `PENDING`
- 所有方确认范围、权限和脱敏规则后再审批
- 不合规的策略应直接驳回，不要批准后再修改

### 3. 撤销

- 已批准策略若不再共享，使用“撤销”
- 已批准策略不能直接修改或删除

## 消费方操作

### 1. 查询共享设备

```bash
curl -H "Authorization: Bearer <token>" \
  "http://<rule-host>/api/v1/shared/devices"
```

若只查看某一条策略下的设备，可加 `policyId`：

```bash
curl -H "Authorization: Bearer <token>" \
  "http://<rule-host>/api/v1/shared/devices?policyId=7"
```

返回结果里的每条记录都带 `policyId`，后续查属性和遥测时继续使用该编号。

### 2. 查询最新属性

```bash
curl -H "Authorization: Bearer <token>" \
  "http://<rule-host>/api/v1/shared/devices/31/properties?policyId=7"
```

### 3. 查询历史遥测

```bash
curl -H "Authorization: Bearer <token>" \
  "http://<rule-host>/api/v1/shared/devices/31/telemetry?policyId=7&property=temperature&startTime=2026-04-01T00:00:00&limit=200"
```

说明：

- `policyId` 必填
- `property` 选填；不传时返回策略允许范围内的全部属性点
- 若策略设置了历史窗口，系统会自动收口开始时间

## 审计日志

共享双方都可以在“跨租户共享”页面查看共享审计日志。

日志会记录：

- 谁创建、修改、审批、驳回、撤销了策略
- 消费方何时读取了共享设备、属性或历史遥测

## 注意事项

- 共享范围 JSON 不能为空，也不能写成非法格式。
- `consumerTenantId` 不能填写当前租户自身。
- 历史旧策略若范围配置不合法，系统不会再按兼容口径放权，需要删除后重建。
- 脱敏规则只会作用在共享读接口返回值，不会修改所有方原始设备数据。
