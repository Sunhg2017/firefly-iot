# OpenAPI / 租户订阅 / AppKey 使用说明

## 1. 适用角色

- 研发人员：在 Controller 方法上标注 `@OpenApi`
- 系统运维管理员：查看自动注册的 OpenAPI 目录
- 平台管理员：为租户配置 OpenAPI 订阅与调用限制
- 租户管理员：为外部系统创建和维护 AppKey

## 2. 系统运维空间：OpenAPI 管理

入口：

- `系统运维 -> OpenAPI 管理`

可执行操作：

- 查询 OpenAPI
- 查看 OpenAPI 详情

研发标注方式：

```java
@OpenApi(
    code = "product.thing-model.by-product-key",
    name = "按 ProductKey 获取产品物模型"
)
@GetMapping("/thing-model/by-product-key")
@RequiresPermission("product:read")
public R<String> getThingModelByProductKey(@RequestParam String productKey) {
    return R.ok(productService.getThingModelByProductKeyForCurrentTenant(productKey));
}
```

标注规则：

- `@OpenApi` 只能标在实际对外开放的 Controller 方法上
- 方法必须只有一个 HTTP Method 和一个确定的请求路径
- `permissionCode` 可以显式填写；如果不填，方法上必须存在单值 `@RequiresPermission`
- 服务发布完成后，目录会在启动后的后台任务中自动同步到系统运维空间，不需要再到页面手工新建
- 若 `firefly-system` 暂时不可达，当前业务服务仍会先正常启动，目录会在后续重试时补齐
- 当前首个已落地示例路径为 `/open/DEVICE/api/v1/products/thing-model/by-product-key?productKey=pk_xxx`

使用建议：

- 编码尽量采用稳定、可读的业务编码，例如 `product.thing-model.by-product-key`
- OpenAPI 页面展示的名称和说明统一使用中文，避免系统运维、平台租户和租户管理员看到英文目录文案
- 路径模板统一按 `/api/v1/...` 口径填写
- 若下游接口仍需动作级权限控制，请确保 `permissionCode` 与实际鉴权口径一致

## 3. 平台租户管理：OpenAPI 订阅

入口：

- `租户管理 -> 更多 -> OpenAPI订阅`

页面含义：

- 每一行代表一条平台已登记的 OpenAPI
- 勾选后表示该租户已订阅该 OpenAPI
- 未勾选的 OpenAPI 不会出现在租户空间 AppKey 的授权范围里

可配置项：

- IP 白名单
  - 留空表示不限制来源 IP
- 并发上限
  - `-1` 表示不限
- 日调用上限
  - `-1` 表示不限

推荐操作步骤：

1. 打开目标租户的 `OpenAPI订阅` 抽屉。
2. 勾选需要开放给该租户的 OpenAPI。
3. 按需填写 IP 白名单、并发上限、日调用上限。
4. 点击 `保存订阅`。

注意事项：

- 已停用的 OpenAPI 不能继续订阅
- `0` 不是合法限制值
- 系统运维租户不支持租户级 OpenAPI 订阅

## 4. 租户空间：AppKey 管理

入口：

- `组织与权限 -> AppKey 管理`

可执行操作：

- 查询 AppKey
- 新建 AppKey
- 编辑 AppKey
- 启用 / 停用 AppKey
- 删除 AppKey
- 查看详情

创建 AppKey 时需要填写：

- AppKey 名称
- 说明
- 授权 OpenAPI
- 每分钟调用上限
- 每日调用上限
- 过期时间

页面行为：

- 只能选择当前租户已订阅且处于启用状态的 OpenAPI
- 创建成功后会弹出 Access Key 和 Secret Key
- Secret Key 只展示一次，关闭后不会再次回显
- Secret Key 只用于调用方本地计算签名，不能放到请求头、query 或请求体里传输

推荐操作步骤：

1. 先确认平台管理员已经为当前租户订阅所需 OpenAPI。
2. 点击 `新建 AppKey`。
3. 选择本 AppKey 可调用的 OpenAPI 子集。
4. 设置限流和过期时间。
5. 创建成功后立即复制并保存 Access Key、Secret Key。
6. 按签名规则改造调用方 SDK 或脚本，再进行联调。

## 5. 调用方式

调用外部接口时需要在请求头中带上：

- `X-App-Key`
- `X-Timestamp`
- `X-Nonce`
- `X-Signature`

调用路径使用网关路径，例如：

- `/open/DEVICE/api/v1/...`
- `/open/SYSTEM/api/v1/...`

签名规则：

1. 先对原始请求体计算 `SHA256`，空 body 也必须参与计算。
2. 对 query 参数按 key/value 排序并做 RFC3986 编码，生成 `canonicalQuery`。
3. 按如下顺序拼接签名串，每行之间使用 `\n`：

```text
HTTP_METHOD
SERVICE_CODE
REQUEST_PATH
CANONICAL_QUERY
BODY_SHA256
TIMESTAMP
NONCE
```

4. 使用 `Secret Key` 对该签名串计算 `HMAC-SHA256`，得到 64 位小写十六进制字符串，放入 `X-Signature`。

示例：

```text
POST
DEVICE
/api/v1/devices/query
pageNum=1&pageSize=20
4d967a0bb5d6f1f0a0ef4f0b2df4c6a0f5ce8d4df3ef7a92f7c7d8d11f7f2b3a
1742529600000
4TqZ9vG2qL8m
```

注意事项：

- `X-Timestamp` 使用毫秒级 Unix 时间戳。
- `X-Nonce` 需保证单次请求唯一，推荐使用 8 到 128 位字母、数字、下划线或中划线组合。
- `Secret Key` 只在本地参与签名计算，服务端不会要求你传输明文 Secret Key。
- 外部调用必须走 `/open/{SERVICE}/api/...`，不要复用平台前端使用的 `/{SERVICE}/api/...` JWT 路径。
- 如果 AppKey 是升级前创建的旧数据，重新创建后再联调。

是否能成功调用，取决于：

- AppKey 是否启用且未过期
- 签名是否正确且时间戳未过期
- nonce 是否重复
- AppKey 是否被授权该 OpenAPI
- 租户是否订阅该 OpenAPI
- 请求 IP 是否命中白名单
- 是否超过并发或调用量限制

## 6. 常见问题

### 6.1 新建 AppKey 时没有可选 OpenAPI

原因通常是当前租户还没有订阅任何已启用 OpenAPI。

处理方式：

- 联系平台管理员到租户管理中先完成 OpenAPI 订阅

### 6.2 调用返回 403

常见原因：

- AppKey 没有授权当前接口
- 租户没有订阅当前接口
- IP 不在白名单内

### 6.3 调用返回 401

常见原因：

- `X-Timestamp` 超出签名有效期
- `X-Nonce` 格式不正确或已被使用
- `X-Signature` 计算规则与平台不一致
- 调用时误把 Secret Key 明文传到了请求里，而不是本地签名

### 6.4 调用返回 429

表示触发了调用限制，请检查：

- AppKey 每分钟上限
- AppKey 每日上限
- 租户订阅并发上限
- 租户订阅单日上限

### 6.5 系统菜单管理里看不到 OpenAPI 管理或 AppKey 管理

常见原因：

- 历史环境升级后，修复系统菜单管理基础数据的 `V30__backfill_open_api_menu_catalog.sql` 尚未执行

处理方式：

- 联系运维确认 `firefly-system` 的 Flyway 已执行到 `V30`
- 确认 `workspace_menu_catalog` 中已经存在 `open-api` 与 `app-key`
