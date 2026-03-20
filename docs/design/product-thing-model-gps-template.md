# 产品物模型 GPS 定位仪模板设计
> 模块: `firefly-web`
> 日期: 2026-03-20
> 状态: Done

## 1. 背景

产品物模型模板库已经覆盖环境监测、电表、视频、网关等常见场景，但缺少定位终端模板。车载定位器、资产追踪器、人员定位卡这类设备在接入时，通常都会重复维护经纬度、速度、围栏告警、实时定位服务等标准能力，手工逐项新建成本高，也容易漏字段。

## 2. 目标

- 在产品物模型模板库中新增一个可直接复用的 `GPS定位仪模板`。
- 模板覆盖定位终端最常见的属性、告警事件和定位服务。
- 保持现有模板库的纯前端实现方式，不新增后端接口、数据库结构和 Flyway 变更。

## 3. 模板内容

### 3.1 属性

模板预置以下属性：

- `latitude`：纬度
- `longitude`：经度
- `altitude`：海拔
- `speed`：速度
- `heading`：航向角
- `satelliteCount`：卫星数
- `fixStatus`：定位状态
- `battery`：电量
- `reportInterval`：上报间隔

其中：

- 定位坐标使用 `float`，按 GPS 常见精度保留 6 位小数。
- `fixStatus` 使用枚举，区分无定位、二维定位、三维定位。
- `reportInterval` 使用 `rw` 属性，便于直接表达设备可远程配置的定位上报周期。

### 3.2 事件

模板预置以下事件：

- `sosAlarm`：SOS 告警
- `geofenceAlarm`：围栏告警
- `lowBattery`：低电量告警

围栏告警中补充：

- `fenceName`
- `transition`
- `timestamp`

这样可以直接表达进入/离开围栏的业务语义，而不需要用户从零定义事件参数。

### 3.3 服务

模板预置以下服务：

- `queryLocation`：实时定位
- `setReportInterval`：设置上报间隔

其中：

- `queryLocation` 用于触发设备立刻返回当前位置。
- `setReportInterval` 用于下发新的定位上报周期。

## 4. 实现方案

- 在 [ProductThingModelDrawer.tsx](E:/codeRepo/service/firefly-iot/firefly-web/src/pages/product/ProductThingModelDrawer.tsx) 的 `THING_MODEL_TEMPLATES` 中新增 `gps-tracker` 模板定义。
- 继续复用现有模板库的“追加模板 / 覆盖当前”两种操作方式。
- 继续复用已有的 `syncDraftModel(...)` 归一化流程，因此模板应用后仍会自动补齐平台固有属性 `ip` 和固有事件。

## 5. 风险与取舍

- 本次没有把坐标做成 `struct` 结构，而是拆成 `latitude/longitude/...` 独立属性，优先保证模板在当前可视化编辑器里可直接查看、编辑和复用。
- 本次不额外引入轨迹历史、基站定位、Wi-Fi 定位等扩展字段，先覆盖 GPS 终端最常见的主路径能力。

## 6. 影响范围

- `firefly-web/src/pages/product/ProductThingModelDrawer.tsx`
