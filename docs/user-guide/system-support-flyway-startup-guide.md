# System/Support 启动使用说明

## 1. 适用角色

- 本地开发人员
- 联调人员
- 排障人员

## 2. 这次变更是什么

`firefly-system` 和 `firefly-support` 在开发环境启动时，如果数据库里已有旧的 Flyway 历史记录，而仓库中的历史迁移脚本又发生过调整，过去会直接因为 checksum mismatch 启动失败。

现在默认行为变为：

- `dev` 环境：不再因为历史 checksum 漂移直接阻塞启动
- `prod` 环境：仍然严格校验

## 3. 如何启动

先安装公共依赖：

```bash
mvn -pl firefly-common,firefly-api -am install -DskipTests
```

启动 `system`：

```bash
cd firefly-system
mvn spring-boot:run
```

启动 `support`：

```bash
cd firefly-support
mvn spring-boot:run
```

## 4. 如果我想强制检查 Flyway 历史一致性

可以在启动前显式打开严格校验。

PowerShell：

```powershell
$env:FLYWAY_VALIDATE_ON_MIGRATE="true"
```

随后再执行 `mvn spring-boot:run`。

如果此时启动失败，并看到 `Migration checksum mismatch`，说明当前数据库历史记录和仓库中的旧迁移脚本已经不一致，这属于需要单独处理的迁移问题。

## 5. 常见问题

### 5.1 为什么现在开发环境能启动了，但日志里历史迁移其实还是漂移的

因为本次修复的目标是“先恢复可启动”，不是把历史 checksum 漂移本身消除掉。真正要清理漂移，仍需要后续按 Flyway repair 流程处理。

### 5.2 生产环境会不会也跳过校验

不会。生产环境默认仍严格校验。

### 5.3 如果还是报内部类缺失怎么办

先执行：

```bash
mvn -pl firefly-common,firefly-api -am install -DskipTests
```

再重新启动服务。
