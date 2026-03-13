# 产品查询删除口径对齐运维说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 适用场景

用于排查设备连接、动态注册、协议解析调试时出现的 PostgreSQL 报错：

`ERROR: column "deleted_at" does not exist`

## 2. 现象说明

典型报错 SQL：

```sql
SELECT * FROM products WHERE product_key = ? AND deleted_at IS NULL LIMIT 1
```

这表示产品查询错误地套用了逻辑删除字段过滤。

## 3. 修复内容

- 已从 `ProductMapper.xml` 的产品忽略租户查询中移除 `deleted_at IS NULL`。
- 产品表当前为物理删除模型，不需要也不能附带该过滤条件。

## 4. 验证步骤

1. 重新启动 `firefly-device`。
2. 使用模拟器或协议解析调试重新发起一次设备连接。
3. 确认不再出现 `products.deleted_at` 缺失报错。
4. 如需本地验证代码，可执行：

```bash
cd firefly-device
mvn test
```

## 5. 排查建议

- 如果类似报错再次出现，优先检查是否有其他产品相关 SQL 误沿用了设备逻辑删除字段。
- 不要通过临时给 `products` 表加 `deleted_at` 列来兜底，这会掩盖产品模块当前真实的物理删除模型。
