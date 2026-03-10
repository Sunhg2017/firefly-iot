# 前端规则8合规性修复进度

## 概述

本文档记录前端页面针对仓库规则8（数据库主键暴露问题）的合规性修复。

**规则8核心要求**：系统数据库主键尽量不要暴露给前端用户，凡是存在业务唯一键的场景，优先使用业务唯一键而不是数据库主键。

## 修复范围

共涉及 **10 个功能模块**，修复内容涵盖：

1. 将数据库主键（ID）输入框改为下拉选择组件
2. 实现产品-设备联动选择
3. 表格列从主键ID改为显示业务名称
4. 选择设备后自动填充设备名称

## 修复详情

| 模块 | 文件路径 | 修复内容 |
|------|----------|----------|
| OTA升级 | `pages/ota/OtaList.tsx` | 产品ID、固件ID改为下拉选择，固件联动产品筛选 |
| 数据共享策略 | `pages/share/SharePage.tsx` | 租户ID改为下拉选择，表格列改为显示租户名称 |
| 固件管理 | `pages/firmware/FirmwarePage.tsx` | 设备ID改为搜索选择，表格列改为显示设备名称 |
| SNMP采集 | `pages/snmp/SnmpPage.tsx` | 产品ID和设备ID改为联动选择 |
| TCP/UDP接入 | `pages/tcpudp/TcpUdpPage.tsx` | 产品ID和设备ID改为联动选择 |
| 设备消息 | `pages/device-message/DeviceMessagePage.tsx` | 3处设备ID改为搜索选择 |
| 数据分析 | `pages/analysis/DataAnalysisPage.tsx` | 4个Tab的设备ID改为搜索选择或多选 |
| Modbus接入 | `pages/modbus/ModbusPage.tsx` | 产品ID和设备ID改为联动选择，设备名称自动填充 |
| 协议解析器 | `pages/protocol-parser/ProtocolParserPage.tsx` | 上行/下行调试的设备ID改为搜索选择 |
| 安全中心 | `pages/security/SecurityPage.tsx` | 会话表格ID列改为显示sessionId |

## 实现模式

### 产品-设备联动选择

```tsx
// 1. 加载产品和设备列表
const [productOptions, setProductOptions] = useState<ProductOption[]>([]);
const [deviceOptions, setDeviceOptions] = useState<DeviceOption[]>([]);
const [filteredDevices, setFilteredDevices] = useState<DeviceOption[]>([]);

// 2. 产品选择变化时联动筛选设备
const handleProductChange = (productId: number | null) => {
  form.setFieldValue('deviceId', undefined);
  if (productId) {
    setFilteredDevices(deviceOptions.filter(d => d.productId === productId));
  } else {
    setFilteredDevices(deviceOptions);
  }
};

// 3. 设备选择变化时自动填充设备名称
const handleDeviceChange = (deviceId: number | null) => {
  const device = deviceOptions.find(d => d.id === deviceId);
  form.setFieldValue('deviceName', device?.deviceName || '');
};
```

### 设备搜索选择

```tsx
<Form.Item name="deviceId" label="目标设备" rules={[{ required: true, message: '请选择设备' }]}>
  <Select
    placeholder="请选择设备"
    showSearch
    optionFilterProp="label"
    style={{ width: 280 }}
    options={deviceOptions.map(d => ({ value: d.id, label: d.deviceName }))}
  />
</Form.Item>
```

## 完成状态

- [x] OTA升级页
- [x] 数据共享策略页
- [x] 固件管理页
- [x] SNMP采集页
- [x] TCP/UDP接入页
- [x] 设备消息页
- [x] 数据分析页
- [x] Modbus接入页
- [x] 协议解析器页
- [x] 安全中心页

## 修复日期

2026-03-10
