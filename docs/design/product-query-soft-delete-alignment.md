# 产品查询删除口径对齐设计说明
> 模块: firefly-device
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

设备连接、动态注册、协议解析调试等链路会按 `productKey` 或 `productId` 查询产品。近期这条链路在 PostgreSQL 上报错：

```sql
SELECT * FROM products WHERE product_key = ? AND deleted_at IS NULL LIMIT 1
```

报错原因是 `products` 表并没有 `deleted_at` 字段。

## 2. 根因

- `firefly-device/src/main/resources/mapper/device/ProductMapper.xml` 中把产品查询误写成了设备侧逻辑删除口径。
- 实际上产品表初始化脚本 `V1__init_products.sql` 只有 `created_at`、`updated_at`，没有 `deleted_at`。
- `Product` 实体也没有 `deletedAt` / `@TableLogic` 字段，产品当前删除方式仍是物理删除。

## 3. 修复方案

- 移除 `ProductMapper.xml` 中 `selectByIdIgnoreTenant` 和 `selectByProductKeyIgnoreTenant` 的 `deleted_at IS NULL` 条件。
- 保持产品查询口径与真实表结构一致，避免协议认证链路在取产品时因错误列名中断。

## 4. 影响范围

- `firefly-device/src/main/resources/mapper/device/ProductMapper.xml`
- 设备连接认证
- 动态注册
- 协议解析调试与运行态产品上下文加载
