# 设备中心菜单结构设计

## 1. 目标

- 设备中心菜单只保留一套最终结构。
- 视频设备不再保留独立菜单，统一并入 `设备管理`。
- 菜单、权限、Flyway 台账同步收口。

## 2. 最终结构

- 设备接入
  - 产品接入
  - 协议解析
  - 协议接入
    - SNMP 接入
    - Modbus 接入
    - WebSocket 接入
    - TCP/UDP 接入
    - LoRaWAN 接入
- 设备资产
  - 设备管理
  - 设备拓扑
  - 设备分组
  - 设备标签
  - 地理围栏
  - 设备影子
  - 设备消息

视频设备视图属于 `设备管理` 内部视图，不再占用独立菜单节点。

## 3. 台账要求

- 删除租户空间独立 `video` 菜单
- 删除 `video` 菜单对应自定义菜单和租户菜单授权数据
- 将 `video:read / video:stream / video:ptz / video:record` 绑定到 `device` 菜单
- 视频资产管理统一依赖 `device:create / device:read / device:update / device:delete`
