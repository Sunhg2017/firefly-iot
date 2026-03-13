# 规则引擎使用说明

## 1. 适用角色

- 租户管理员
- 项目管理员
- 具备 `rule:*` 权限的运维或集成人员

## 2. 功能概览

规则引擎当前用于管理规则定义，不直接在界面上执行规则。每条规则由两部分组成：

- 规则基础信息
  - 名称、描述、项目归属、规则表达式
- 动作列表
  - 一个或多个动作，按 `sortOrder` 顺序执行

支持的动作类型来自系统枚举：

- `DB_WRITE`
- `KAFKA_FORWARD`
- `WEBHOOK`
- `EMAIL`
- `SMS`
- `DEVICE_COMMAND`

## 3. 创建规则

### 3.1 接口

`POST /api/v1/rules`

### 3.2 请求示例

```json
{
  "name": "高温告警联动",
  "description": "温度超过 50 度时通知值班人",
  "projectId": 101,
  "sqlExpr": "SELECT deviceName, payload.temperature AS temp FROM 't_001/pk_demo/+/PROPERTY_REPORT' WHERE payload.temperature > 50",
  "actions": [
    {
      "actionType": "WEBHOOK",
      "actionConfig": "{\"url\":\"https://ops.example.com/hooks/high-temp\",\"method\":\"POST\"}",
      "sortOrder": 1,
      "enabled": true
    },
    {
      "actionType": "EMAIL",
      "actionConfig": "{\"to\":\"ops@example.com\",\"subject\":\"高温告警\"}",
      "sortOrder": 2,
      "enabled": true
    }
  ]
}
```

### 3.3 注意事项

- `name` 和 `sqlExpr` 必填，系统会自动去掉首尾空格
- `actionConfig` 需要传合法 JSON 字符串
- `enabled` 不传时默认按 `true`
- `sortOrder` 不传时默认按 `0`
- 新建规则默认状态为 `DISABLED`

## 4. 查询规则

### 4.1 分页查询

`POST /api/v1/rules/list`

示例：

```json
{
  "pageNum": 1,
  "pageSize": 20,
  "keyword": "高温",
  "status": "DISABLED",
  "projectId": 101
}
```

### 4.2 详情查询

`GET /api/v1/rules/{id}`

说明：

- 详情响应会返回动作列表
- 仅能查询当前租户自己的规则

## 5. 更新、启停与删除

### 5.1 更新

`PUT /api/v1/rules/{id}`

说明：

- 如果本次请求带了 `actions`，系统会先清空旧动作，再按新动作列表重建
- 如果不传 `actions`，则保留原有动作

### 5.2 启用

`PUT /api/v1/rules/{id}/enable`

### 5.3 停用

`PUT /api/v1/rules/{id}/disable`

### 5.4 删除

`DELETE /api/v1/rules/{id}`

说明：

- 删除规则时，关联动作会随数据库外键级联删除
- 建议先停用，再删除

## 6. 常见问题

### 6.1 为什么规则创建成功但其他租户查不到？

规则天然按租户隔离，当前版本对详情、更新、启停、删除都做了租户归属校验。

### 6.2 为什么动作配置报 JSON 错误？

因为 `actionConfig` 不是普通文本，它会被存进 PostgreSQL JSONB 字段，必须是合法 JSON 字符串。例如：

正确：

```json
"{\"url\":\"https://example.com/hook\"}"
```

错误：

```text
{url:https://example.com/hook}
```

### 6.3 规则启用后为什么看不到触发次数变化？

当前模块已完成规则定义管理，但完整执行链路尚未在规则引擎界面中交付，因此启用仅表示规则进入可运行状态，不代表界面已经内置实时执行器。
