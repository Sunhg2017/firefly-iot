# Java 全限定名调用清理运维说明
> 模块: repository-wide Java code style cleanup
> 日期: 2026-03-14
> 状态: Done

## 1. 适用场景

用于代码巡检、静态检查和后续评审时快速判断以下问题：

- 业务代码里直接出现 `new com.xxx...`
- 普通静态调用写成 `java.util.Map.of(...)`
- builder 调用写成 `com.xxx.Type.builder()`

## 2. 本次处理内容

- 清理了仓库中无必要的全限定类名调用
- 保留了确实需要显式限定的同名冲突场景
- 对多模块代码做了编译/测试验证，确保仅是风格清理，没有引入行为变更

## 3. 后续检查规则

评审和自检时按以下规则处理：

1. 若无类名冲突，必须通过 `import` 使用简单类名
2. 若存在真实同名冲突，可保留全限定名，但应尽量局部、明确
3. AOP pointcut 字符串中的类名不在本规则限制范围内
4. OpenAPI `@RequestBody` 与 Spring `@RequestBody` 同名冲突时，可保留显式限定

## 4. 验证命令

```bash
mvn -pl firefly-connector,firefly-device,firefly-gateway,firefly-media,firefly-support,firefly-system -am -DskipTests compile
mvn -pl firefly-connector -am "-Dtest=DeviceIdentityResolveServiceTest,TcpUdpProtocolAdapterTest" test
```
