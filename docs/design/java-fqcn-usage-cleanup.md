# Java 全限定名调用清理设计说明
> 模块: repository-wide Java code style cleanup
> 日期: 2026-03-14
> 状态: Done

## 1. 背景

仓库中存在一批 Java 代码在没有类名冲突的前提下，直接使用全限定类名调用构造器、静态方法或 builder，例如：

- `new com.fasterxml.jackson.databind.ObjectMapper()`
- `java.util.Map.of(...)`
- `com.xxx.SomeType.builder()`

这类写法会带来两个问题：

- 可读性差，业务代码里夹杂大量包名噪音
- 后续维护时容易继续复制这种写法，形成风格污染

## 2. 目标

- 清理无必要的全限定类名调用，统一改为正常 `import`
- 保留确实需要显式限定的场景
- 为后续开发明确边界：无类名冲突时禁止继续这样写

## 3. 修复范围

本次覆盖以下模块中的实际代码与测试代码：

- `firefly-connector`
- `firefly-device`
- `firefly-gateway`
- `firefly-media`
- `firefly-support`
- `firefly-system`

## 4. 保留策略

以下场景保留全限定名，不纳入本次清理：

- AOP pointcut 表达式字符串中的注解类名
- 与 Spring `@RequestBody` 同名的 OpenAPI `@io.swagger...RequestBody`
- 其他真实存在简单类名冲突、显式限定更安全的场景

## 5. 修复方式

- 对构造器调用改为增加 `import` 后使用简单类名
- 对静态工厂调用改为增加 `import` 后使用简单类名
- 对 builder / 类型引用改为增加 `import` 后使用简单类名
- 对测试中的 `ArgumentMatchers.any(...)`、`Map.of(...)` 同步收敛，避免示例继续扩散
