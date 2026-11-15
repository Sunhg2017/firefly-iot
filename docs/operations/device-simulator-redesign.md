# 设备模拟器运维说明（重设计版）

> 模块: `firefly-simulator`
> 日期: 2026-11-15
> 关联: [设计说明](../design/device-simulator-redesign.md)、[使用说明](../user-guide/device-simulator-redesign-guide.md)

## 1. 运行环境

- 桌面端：Electron 33 + React 18 + Vite 6。
- 依赖服务：
  - 平台网关（登录、产品/设备列表、视频资产、审计）。
  - Connector（HTTP/MQTT/CoAP 接入、SNMP/Modbus 测试、WebSocket/TCP/UDP、LoRaWAN Webhook）。
- 压测时额外依赖目标 MQTT Broker、Connector 连接上限与网络带宽。

## 2. 安装与启动

```bash
cd firefly-simulator
npm install
npm run ensure:electron
npm run electron:dev
```

构建：

```bash
npm run electron:build
```

仅验证渲染层：

```bash
npm run build:vite
```

说明：

- `npm run ensure:electron` 会检查 Electron 二进制；如果安装时使用 `--ignore-scripts`，需要单独执行。
- 压测中心复用现有 IPC，不需要启动新的后端服务。
- 若只做 UI 检查，可用 `npm run dev` 在浏览器打开，但登录/设备操作依赖 Electron IPC，浏览器中不可用。

## 3. 目录与状态

| 位置 | 内容 |
| --- | --- |
| Electron userData | `firefly-sim-store`（设备与模板持久化） |
| 浏览器 localStorage | 同上，仅保存 ≤1MB 的配置；大批量数据以 Electron store 为准 |
| `firefly-simulator:page` | 当前页面，刷新/重启后恢复 |
| 运行日志 | 内存中最近 500 条，不落盘 |

持久化写入做了 200ms 合并；应用正常退出前会把 ≤1MB 的最新状态补写 localStorage。**不要手工修改 Electron store 文件**，需要清理时在应用内删除设备或清理 userData 目录。

## 4. 压测容量建议

| 场景 | 建议 |
| --- | --- |
| 常规联调 | 1-50 台设备，Worker 5-20 |
| 中等压测 | 100-300 台，Worker 20-50，间隔 100-500ms |
| 大规模压测 | 500-1000 台，Worker 50-100，先小规模验证 |
| MQTT 长连接 | 每台设备一个 MQTT 连接，1000 台以上先评估 Broker 连接数与主进程内存 |
| WebSocket/TCP | 同样每台设备一个连接，注意文件描述符与端口占用 |
| SNMP/Modbus | 压力在 Connector 与目标设备，不在模拟器本机 |
| 视频/GB28181 | 不参与批量压测，仅单设备联调 |

调参顺序：先验证 10 台 × 10 次 → 逐步提高 Worker → 再提高设备数。观察：
- 失败率是否上升；
- P95/P99 是否持续增大；
- 错误 Top 是否集中在连接超时/认证失败/限流；
- 本机 CPU/内存与 Connector 连接数。

## 5. 常见故障

| 现象 | 排查 |
| --- | --- |
| 批量创建后设备无法连接 | 检查 ProductKey/DeviceName 是否与平台一致；动态注册需要 ProductSecret；一机一密需要每台设备自己的 DeviceSecret |
| 压测开始即大量失败 | 设备是否在线；HTTP/CoAP token 是否为空；MQTT 是否已连接；WS/TCP/UDP 是否已连接 |
| 批量连接很慢 | 连接并发默认 8；可提高到 20，但注意服务端/Connector 压力 |
| 压测 TPS 上不去 | Worker 数、发送间隔、单请求延迟、Connector 限流、Broker 性能 |
| 压测报告缺失历史 | 历史只保存在当前会话，退出/刷新后清空；请先导出 JSON |
| 设备列表刷新后丢失 | 检查 Electron store 是否可写；大批量配置不写 localStorage 是预期行为 |
| 产品下拉为空 | 当前环境未登录、无该协议产品，或登录已过期；重新登录或手工填写 ProductKey |
| SNMP/Modbus 压测失败 | Connector 地址是否可达；目标设备/端口是否正确；SNMP v3 需在单设备详情中配置（批量创建暂只支持 community） |
| 页面空白/渲染异常 | 打开 DevTools 查看 Console；重启应用；必要时清理 userData 后重新导入设备配置 |

## 6. 日志与观测

- 设备连接、发送、错误会写入“运行日志”页，可按当前设备过滤。
- 压测中心实时展示 TPS、成功率、延迟分位、协议分布、错误 Top。
- 压测开始/暂停/继续/停止/完成都会写入系统日志。
- 需要长期留存时导出 JSON 报告，或通过日志页导出。

## 7. 回滚

- 前端/桌面端回滚：重新安装上一个版本的安装包；设备配置存储在 userData，版本回滚不会自动清理。
- 存储结构未做破坏性变更（新增批量 action，持久化字段兼容旧数据）。
- 若新版本无法启动，可备份后删除 userData 下的模拟器存储文件，回到空配置状态再导入设备 JSON。

## 8. 安全注意事项

- 模拟器会保存 DeviceSecret/ProductSecret，属于敏感凭据；不要把 userData 目录或导出的设备 JSON 提交到仓库/公开渠道。
- 压测只对已授权环境执行；大批量请求可能触发平台限流、告警或配额，请提前与平台运维确认。
- 导出的压测报告包含设备名称与接入标识，分享前请脱敏。
