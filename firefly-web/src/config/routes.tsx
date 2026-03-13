import React from 'react';
import {
  DashboardOutlined,
  TeamOutlined,
  SafetyOutlined,
  BankOutlined,
  AppstoreOutlined,
  HddOutlined,
  ThunderboltOutlined,
  AlertOutlined,
  CloudUploadOutlined,
  LineChartOutlined,
  VideoCameraOutlined,
  FileSearchOutlined,
  SettingOutlined,
  BellOutlined,
  ShareAltOutlined,
  FundOutlined,
  ProjectOutlined,
  GroupOutlined,
  TagOutlined,
  AimOutlined,
  UsbOutlined,
  ExportOutlined,
  FileTextOutlined,
  MessageOutlined,
  MonitorOutlined,
  KeyOutlined,
  BookOutlined,
  ReconciliationOutlined,
  LockOutlined,
  CloudSyncOutlined,
  ApiOutlined,
  SendOutlined,
  ControlOutlined,
  DatabaseOutlined,
  ToolOutlined,
  ScheduleOutlined,
} from '@ant-design/icons';

export interface RouteItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  permission?: string | string[];
}

export interface RouteGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  children: RouteItem[];
}

export type RouteEntry = RouteItem | RouteGroup;

export function isRouteGroup(entry: RouteEntry): entry is RouteGroup {
  return 'children' in entry;
}

/**
 * 路由配置：分组+权限映射。
 *
 * permission 采用 "{resource}:read" 形式，表示至少需要该资源的读取权限才能看到菜单。
 * 没有 permission 的路由对所有已登录用户可见。
 * 分组中如果所有子项都无权限则整个分组隐藏。
 *
 * hasPermission 在 useAuthStore 中支持通配符匹配：
 *   user.permissions 包含 "device:read" 或 "device:*" 均可。
 */
const routeConfigs: RouteEntry[] = [
  { path: '/dashboard', label: '工作台', icon: <DashboardOutlined />, permission: 'dashboard:read' },

  {
    key: 'system-mgmt',
    label: '系统管理',
    icon: <SettingOutlined />,
    children: [
      { path: '/tenant', label: '租户管理', icon: <BankOutlined />, permission: 'tenant:read' },
      { path: '/user', label: '用户管理', icon: <TeamOutlined />, permission: 'user:read' },
      { path: '/role', label: '角色权限', icon: <SafetyOutlined />, permission: 'role:read' },
      { path: '/permission', label: '权限资源', icon: <KeyOutlined />, permission: 'permission:read' },
      { path: '/dict', label: '数据字典', icon: <BookOutlined />, permission: 'dict:read' },
      { path: '/settings', label: '系统设置', icon: <SettingOutlined />, permission: 'system:read' },
      { path: '/scheduled-task', label: '定时任务', icon: <ScheduleOutlined />, permission: 'system:read' },
      { path: '/menu-config', label: '菜单配置', icon: <ReconciliationOutlined />, permission: 'system:update' },
    ],
  },

  {
    key: 'project-mgmt',
    label: '项目管理',
    icon: <ProjectOutlined />,
    children: [
      { path: '/project', label: '项目列表', icon: <ProjectOutlined />, permission: 'project:read' },
      { path: '/share', label: '跨租户共享', icon: <ShareAltOutlined />, permission: 'share:read' },
    ],
  },

  {
    key: 'device-mgmt',
    label: '设备中心',
    icon: <HddOutlined />,
    children: [
      { path: '/product', label: '产品管理', icon: <AppstoreOutlined />, permission: 'product:read' },
      { path: '/protocol-parser', label: '协议解析', icon: <ApiOutlined />, permission: 'protocol-parser:read' },
      { path: '/device', label: '设备管理', icon: <HddOutlined />, permission: 'device:read' },
      { path: '/device-group', label: '设备分组', icon: <GroupOutlined />, permission: 'device-group:read' },
      { path: '/device-tag', label: '设备标签', icon: <TagOutlined />, permission: 'device-tag:read' },
      { path: '/geo-fence', label: '地理围栏', icon: <AimOutlined />, permission: 'geo-fence:read' },
      { path: '/device-shadow', label: '设备影子', icon: <CloudSyncOutlined />, permission: 'device:read' },
      { path: '/device-message', label: '设备消息', icon: <SendOutlined />, permission: 'device:read' },
      { path: '/snmp', label: 'SNMP 接入', icon: <ApiOutlined />, permission: 'device:read' },
      { path: '/modbus', label: 'Modbus 接入', icon: <ApiOutlined />, permission: 'device:read' },
      { path: '/websocket', label: 'WebSocket 接入', icon: <ApiOutlined />, permission: 'device:read' },
      { path: '/tcp-udp', label: 'TCP/UDP 接入', icon: <ApiOutlined />, permission: 'device:read' },
      { path: '/lorawan', label: 'LoRaWAN 接入', icon: <ApiOutlined />, permission: 'device:read' },
    ],
  },

  {
    key: 'rule-alarm',
    label: '规则告警',
    icon: <ControlOutlined />,
    children: [
      { path: '/rule-engine', label: '规则引擎', icon: <ThunderboltOutlined />, permission: 'rule:read' },
      { path: '/alarm-rules', label: '告警规则维护', icon: <AlertOutlined />, permission: 'alarm:read' },
      {
        path: '/alarm-records',
        label: '告警处理',
        icon: <ToolOutlined />,
        permission: ['alarm:read', 'alarm:confirm', 'alarm:process'],
      },
      { path: '/notification', label: '通知中心', icon: <BellOutlined />, permission: 'notification:read' },
      { path: '/message-template', label: '消息模板', icon: <MessageOutlined />, permission: 'message-template:read' },
    ],
  },

  {
    key: 'data-insight',
    label: '数据洞察',
    icon: <DatabaseOutlined />,
    children: [
      { path: '/device-data', label: '设备数据', icon: <LineChartOutlined />, permission: 'data:read' },
      { path: '/analysis', label: '数据分析', icon: <FundOutlined />, permission: 'analysis:read' },
      { path: '/device-log', label: '设备日志', icon: <FileTextOutlined />, permission: 'device-log:read' },
      { path: '/export', label: '异步任务', icon: <ExportOutlined />, permission: 'export:read' },
    ],
  },

  {
    key: 'ops-tools',
    label: '运维工具',
    icon: <ToolOutlined />,
    children: [
      { path: '/firmware', label: '固件管理', icon: <UsbOutlined />, permission: 'firmware:read' },
      { path: '/ota', label: 'OTA 升级', icon: <CloudUploadOutlined />, permission: 'ota:read' },
      { path: '/video', label: '视频监控', icon: <VideoCameraOutlined />, permission: 'device:read' },
      { path: '/monitor', label: '系统监控', icon: <MonitorOutlined />, permission: 'monitor:read' },
    ],
  },

  {
    key: 'security-audit',
    label: '安全审计',
    icon: <LockOutlined />,
    children: [
      { path: '/security', label: '安全管理', icon: <LockOutlined />, permission: 'user:read' },
      { path: '/api-key', label: 'API Key', icon: <ApiOutlined />, permission: 'apikey:read' },
      { path: '/audit-log', label: '审计日志', icon: <FileSearchOutlined />, permission: 'audit:read' },
      { path: '/operation-log', label: '操作日志', icon: <ReconciliationOutlined />, permission: 'operation-log:read' },
    ],
  },
];

export default routeConfigs;
