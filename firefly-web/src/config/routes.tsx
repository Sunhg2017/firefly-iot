import React from 'react';
import {
  ApartmentOutlined,
  AlertOutlined,
  AimOutlined,
  ApiOutlined,
  AppstoreOutlined,
  BankOutlined,
  BellOutlined,
  BookOutlined,
  CloudSyncOutlined,
  CloudUploadOutlined,
  ControlOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  ExportOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FundOutlined,
  GroupOutlined,
  HddOutlined,
  KeyOutlined,
  LineChartOutlined,
  LockOutlined,
  MessageOutlined,
  MenuOutlined,
  MonitorOutlined,
  ProjectOutlined,
  SafetyOutlined,
  ScheduleOutlined,
  SecurityScanOutlined,
  SendOutlined,
  SettingOutlined,
  ShareAltOutlined,
  TagOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UsbOutlined,
  VideoCameraOutlined,
} from '@ant-design/icons';
import { ALARM_TEXT } from '../pages/alarm/alarmText';

export type WorkspaceScope = 'platform' | 'tenant' | 'both';

export interface RouteItem {
  path: string;
  label: string;
  icon: React.ReactNode;
  permission?: string | string[];
  workspace: WorkspaceScope;
}

export interface RouteGroup {
  key: string;
  label: string;
  icon: React.ReactNode;
  workspace: WorkspaceScope;
  children: RouteNode[];
}

export type RouteNode = RouteItem | RouteGroup;
export type RouteEntry = RouteNode;

export const DEVICE_PROTOCOL_GROUP_KEY = 'tenant-device-protocol-access';

export function isRouteGroup(entry: RouteEntry): entry is RouteGroup {
  return 'children' in entry;
}

const routeConfigs: RouteEntry[] = [
  {
    path: '/dashboard',
    label: '工作台',
    icon: <DashboardOutlined />,
    permission: 'dashboard:read',
    workspace: 'both',
  },

  {
    key: 'platform-tenant-space',
    label: '租户与空间',
    icon: <BankOutlined />,
    workspace: 'platform',
    children: [
      { path: '/tenant', label: '租户管理', icon: <BankOutlined />, permission: 'tenant:read', workspace: 'platform' },
    ],
  },
  {
    key: 'platform-identity-access',
    label: '用户与权限',
    icon: <SafetyOutlined />,
    workspace: 'platform',
    children: [
      { path: '/user', label: '用户管理', icon: <TeamOutlined />, permission: 'user:read', workspace: 'platform' },
      { path: '/role', label: '角色管理', icon: <SafetyOutlined />, permission: 'role:read', workspace: 'platform' },
      { path: '/permission', label: '权限资源', icon: <KeyOutlined />, permission: 'permission:read', workspace: 'platform' },
      {
        path: '/system-menu-permission',
        label: '系统菜单权限',
        icon: <AppstoreOutlined />,
        permission: 'workspace-menu:read',
        workspace: 'platform',
      },
      { path: '/menu-customization', label: '菜单配置', icon: <MenuOutlined />, permission: 'menu-customization:read', workspace: 'platform' },
      { path: '/dict', label: '数据字典', icon: <BookOutlined />, permission: 'dict:read', workspace: 'platform' },
    ],
  },
  {
    key: 'platform-system-ops',
    label: '系统运维',
    icon: <SettingOutlined />,
    workspace: 'platform',
    children: [
      { path: '/settings', label: '系统设置', icon: <SettingOutlined />, permission: 'system:read', workspace: 'platform' },
      { path: '/open-api', label: 'OpenAPI 管理', icon: <ApiOutlined />, permission: 'openapi:read', workspace: 'platform' },
      { path: '/notification', label: '通知渠道', icon: <BellOutlined />, permission: 'notification:read', workspace: 'platform' },
      { path: '/scheduled-task', label: '定时任务', icon: <ScheduleOutlined />, permission: 'system:read', workspace: 'platform' },
      { path: '/monitor', label: '系统监控', icon: <MonitorOutlined />, permission: 'monitor:read', workspace: 'platform' },
    ],
  },
  {
    key: 'platform-security-audit',
    label: '安全审计',
    icon: <SecurityScanOutlined />,
    workspace: 'platform',
    children: [
      { path: '/security', label: '安全管理', icon: <LockOutlined />, permission: 'user:read', workspace: 'platform' },
      { path: '/audit-log', label: '审计日志', icon: <FileSearchOutlined />, permission: 'audit:read', workspace: 'platform' },
      { path: '/operation-log', label: '操作日志', icon: <FileTextOutlined />, permission: 'operation-log:read', workspace: 'platform' },
    ],
  },

  {
    key: 'tenant-identity-access',
    label: '组织与权限',
    icon: <TeamOutlined />,
    workspace: 'tenant',
    children: [
      { path: '/user', label: '用户管理', icon: <TeamOutlined />, permission: 'user:read', workspace: 'tenant' },
      { path: '/role', label: '角色管理', icon: <SafetyOutlined />, permission: 'role:read', workspace: 'tenant' },
      { path: '/app-key', label: 'AppKey 管理', icon: <KeyOutlined />, permission: 'appkey:read', workspace: 'tenant' },
      { path: '/menu-customization', label: '菜单配置', icon: <MenuOutlined />, permission: 'menu-customization:read', workspace: 'tenant' },
    ],
  },
  {
    key: 'tenant-project-collaboration',
    label: '项目协同',
    icon: <ProjectOutlined />,
    workspace: 'tenant',
    children: [
      { path: '/project', label: '项目管理', icon: <ProjectOutlined />, permission: 'project:read', workspace: 'tenant' },
      { path: '/share', label: '跨租户共享', icon: <ShareAltOutlined />, permission: 'share:read', workspace: 'tenant' },
    ],
  },
  {
    key: 'tenant-device-access',
    label: '设备接入',
    icon: <ApiOutlined />,
    workspace: 'tenant',
    children: [
      { path: '/product', label: '产品与物模型', icon: <AppstoreOutlined />, permission: 'product:read', workspace: 'tenant' },
      { path: '/protocol-parser', label: '协议解析', icon: <ApiOutlined />, permission: 'protocol-parser:read', workspace: 'tenant' },
      {
        key: DEVICE_PROTOCOL_GROUP_KEY,
        label: '协议接入',
        icon: <ApiOutlined />,
        workspace: 'tenant',
        children: [
          { path: '/snmp', label: 'SNMP 接入', icon: <ApiOutlined />, permission: 'device:read', workspace: 'tenant' },
          { path: '/modbus', label: 'Modbus 接入', icon: <ApiOutlined />, permission: 'device:read', workspace: 'tenant' },
          { path: '/websocket', label: 'WebSocket 接入', icon: <ApiOutlined />, permission: 'device:read', workspace: 'tenant' },
          { path: '/tcp-udp', label: 'TCP/UDP 接入', icon: <ApiOutlined />, permission: 'device:read', workspace: 'tenant' },
          { path: '/lorawan', label: 'LoRaWAN 接入', icon: <ApiOutlined />, permission: 'device:read', workspace: 'tenant' },
        ],
      },
    ],
  },
  {
    key: 'tenant-device-assets',
    label: '设备资产',
    icon: <HddOutlined />,
    workspace: 'tenant',
    children: [
      { path: '/device', label: '设备管理', icon: <HddOutlined />, permission: 'device:read', workspace: 'tenant' },
      { path: '/device-topology', label: '设备拓扑', icon: <ApartmentOutlined />, permission: 'device:read', workspace: 'tenant' },
      { path: '/device-group', label: '设备分组', icon: <GroupOutlined />, permission: 'device-group:read', workspace: 'tenant' },
      { path: '/device-tag', label: '设备标签', icon: <TagOutlined />, permission: 'device-tag:read', workspace: 'tenant' },
      { path: '/geo-fence', label: '地理围栏', icon: <AimOutlined />, permission: 'geo-fence:read', workspace: 'tenant' },
      { path: '/device-shadow', label: '设备影子', icon: <CloudSyncOutlined />, permission: 'device:read', workspace: 'tenant' },
      { path: '/device-message', label: '设备消息', icon: <SendOutlined />, permission: 'device:read', workspace: 'tenant' },
    ],
  },
  {
    key: 'tenant-rule-alarm',
    label: '规则与告警',
    icon: <ControlOutlined />,
    workspace: 'tenant',
    children: [
      { path: '/rule-engine', label: '规则引擎', icon: <ThunderboltOutlined />, permission: 'rule:read', workspace: 'tenant' },
      { path: '/alarm-rules', label: ALARM_TEXT.ruleMenu, icon: <AlertOutlined />, permission: 'alarm:read', workspace: 'tenant' },
      {
        path: '/alarm-recipient-groups',
        label: ALARM_TEXT.recipientGroupMenu,
        icon: <TeamOutlined />,
        permission: ['alarm:read', 'alarm:update'],
        workspace: 'tenant',
      },
      {
        path: '/alarm-records',
        label: ALARM_TEXT.recordMenu,
        icon: <ToolOutlined />,
        permission: ['alarm:read', 'alarm:confirm', 'alarm:process'],
        workspace: 'tenant',
      },
      { path: '/notification-records', label: '通知记录', icon: <BellOutlined />, permission: 'notification:read', workspace: 'tenant' },
      { path: '/message-template', label: '消息模板', icon: <MessageOutlined />, permission: 'message-template:read', workspace: 'tenant' },
    ],
  },
  {
    key: 'tenant-data-insight',
    label: '数据与任务',
    icon: <DatabaseOutlined />,
    workspace: 'tenant',
    children: [
      { path: '/device-data', label: '设备数据', icon: <LineChartOutlined />, permission: 'data:read', workspace: 'tenant' },
      { path: '/analysis', label: '数据分析', icon: <FundOutlined />, permission: 'analysis:read', workspace: 'tenant' },
      { path: '/device-log', label: '设备日志', icon: <FileTextOutlined />, permission: 'device-log:read', workspace: 'tenant' },
      { path: '/export', label: '异步任务', icon: <ExportOutlined />, permission: 'export:read', workspace: 'tenant' },
    ],
  },
  {
    key: 'tenant-ops-tools',
    label: '运维工具',
    icon: <ToolOutlined />,
    workspace: 'tenant',
    children: [
      { path: '/firmware', label: '固件管理', icon: <UsbOutlined />, permission: 'firmware:read', workspace: 'tenant' },
      { path: '/ota', label: 'OTA 升级', icon: <CloudUploadOutlined />, permission: 'ota:read', workspace: 'tenant' },
      { path: '/video', label: '视频监控', icon: <VideoCameraOutlined />, permission: 'video:read', workspace: 'tenant' },
    ],
  },
];

function normalizeRoutePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`;
}

export function flattenRouteItems(nodes: RouteNode[] = routeConfigs): RouteItem[] {
  const items: RouteItem[] = [];
  const walk = (entries: RouteNode[]) => {
    entries.forEach((entry) => {
      if (isRouteGroup(entry)) {
        walk(entry.children);
        return;
      }
      items.push(entry);
    });
  };
  walk(nodes);
  return items;
}

const routeItemMap = new Map<string, RouteItem>();
flattenRouteItems().forEach((item) => {
  routeItemMap.set(normalizeRoutePath(item.path), item);
});

export function getRouteItemByPath(pathname: string): RouteItem | null {
  return routeItemMap.get(normalizeRoutePath(pathname)) ?? null;
}

export function isRoutePathRegistered(pathname: string): boolean {
  return routeItemMap.has(normalizeRoutePath(pathname));
}

export default routeConfigs;
