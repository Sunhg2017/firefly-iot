# 设备中心菜单结构运维说明

## 1. 本次变化

- 删除租户空间独立 `video` 菜单
- 视频设备入口并入 `/device`
- `V35__converge_video_permissions_to_device_menu.sql` 同步清理菜单台账

## 2. 发布检查

1. 执行 `firefly-system` 最新 Flyway
2. 构建 `firefly-web`
3. 登录租户空间验证菜单

## 3. 验证项

1. 左侧菜单中不再出现独立“视频监控”
2. `设备资产 -> 设备管理` 正常显示
3. 从产品页点击摄像头接入后，能进入 `/device`
4. 菜单管理和授权目录中不再出现 `TENANT/video`

## 4. 常见问题

### 4.1 侧边栏还有视频监控菜单

排查：

1. 检查 `V35` 是否执行成功
2. 检查是否残留 `workspace_menu_customizations.menu_key='video'`
3. 检查浏览器是否缓存旧前端资源
