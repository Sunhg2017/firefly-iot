import React, { Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Spin } from 'antd';
import BasicLayout from './layouts/BasicLayout';
import PrivateRoute from './components/PrivateRoute';
import LoginPage from './pages/login';
import useAuthStore from './store/useAuthStore';
import { getUserHomePath } from './config/workspaceRoutes';

const Dashboard = React.lazy(() => import('./pages/dashboard/DashboardPage'));
const TenantList = React.lazy(() => import('./pages/tenant/TenantList'));
const UserList = React.lazy(() => import('./pages/user/UserList'));
const RoleList = React.lazy(() => import('./pages/role/RoleList'));
const ProjectList = React.lazy(() => import('./pages/project/ProjectList'));
const ProductList = React.lazy(() => import('./pages/product/ProductList'));
const ProtocolParserPage = React.lazy(() => import('./pages/protocol-parser/ProtocolParserPage'));
const DeviceList = React.lazy(() => import('./pages/device/DeviceList'));
const DeviceTopologyPage = React.lazy(() => import('./pages/device-topology/DeviceTopologyPage'));
const DeviceGroupPage = React.lazy(() => import('./pages/device-group/DeviceGroupPage'));
const DeviceTagPage = React.lazy(() => import('./pages/device-tag/DeviceTagPage'));
const GeoFencePage = React.lazy(() => import('./pages/geo/GeoFencePage'));
const FirmwarePage = React.lazy(() => import('./pages/firmware/FirmwarePage'));
const ExportPage = React.lazy(() => import('./pages/export/ExportPage'));
const DeviceLogPage = React.lazy(() => import('./pages/device-log/DeviceLogPage'));
const MessageTemplatePage = React.lazy(() => import('./pages/message-template/MessageTemplatePage'));
const SystemMonitorPage = React.lazy(() => import('./pages/monitor/SystemMonitorPage'));
const PermissionResourcePage = React.lazy(() => import('./pages/permission/PermissionResourcePage'));
const SystemMenuPermissionPage = React.lazy(() => import('./pages/system-menu-permission/SystemMenuPermissionPage'));
const WorkspaceMenuCustomizationPage = React.lazy(() => import('./pages/menu-customization/WorkspaceMenuCustomizationPage'));
const DictPage = React.lazy(() => import('./pages/dict/DictPage'));
const RuleEngineList = React.lazy(() => import('./pages/rule-engine/RuleEngineList'));
const AlarmRulePage = React.lazy(() => import('./pages/alarm/AlarmRulePage'));
const AlarmRecordPage = React.lazy(() => import('./pages/alarm/AlarmRecordPage'));
const AlarmRecipientGroupPage = React.lazy(() => import('./pages/alarm/AlarmRecipientGroupPage'));
const OtaList = React.lazy(() => import('./pages/ota/OtaList'));
const DeviceDataPage = React.lazy(() => import('./pages/device-data/DeviceDataPage'));
const VideoList = React.lazy(() => import('./pages/video/VideoList'));
const AuditLogPage = React.lazy(() => import('./pages/audit/AuditLogPage'));
const SystemSettingsPage = React.lazy(() => import('./pages/settings/SystemSettingsPage'));
const NotificationPage = React.lazy(() => import('./pages/notification/NotificationPage'));
const NotificationRecordPage = React.lazy(() => import('./pages/notification/NotificationRecordPage'));
const SharePage = React.lazy(() => import('./pages/share/SharePage'));
const DataAnalysisPage = React.lazy(() => import('./pages/analysis/DataAnalysisPage'));
const OperationLogPage = React.lazy(() => import('./pages/operation-log/OperationLogPage'));
const OpenApiPage = React.lazy(() => import('./pages/open-api/OpenApiPage'));
const ApiKeyPage = React.lazy(() => import('./pages/api-key/ApiKeyPage'));
const SecurityPage = React.lazy(() => import('./pages/security/SecurityPage'));
const DeviceShadowPage = React.lazy(() => import('./pages/device-shadow/DeviceShadowPage'));
const DeviceMessagePage = React.lazy(() => import('./pages/device-message/DeviceMessagePage'));
const ScheduledTaskPage = React.lazy(() => import('./pages/scheduled-task/ScheduledTaskPage'));
const SnmpPage = React.lazy(() => import('./pages/snmp/SnmpPage'));
const ModbusPage = React.lazy(() => import('./pages/modbus/ModbusPage'));
const WebSocketPage = React.lazy(() => import('./pages/websocket/WebSocketPage'));
const TcpUdpPage = React.lazy(() => import('./pages/tcpudp/TcpUdpPage'));
const LoRaWanPage = React.lazy(() => import('./pages/lorawan/LoRaWanPage'));
const ForbiddenPage = React.lazy(() => import('./pages/403'));

const Loading = () => (
  <div className="app-loading">
    <Spin size="large" />
  </div>
);

const HomeRedirect: React.FC = () => {
  const { user } = useAuthStore();

  // Root and in-app wildcard routes must resolve against the current user's accessible menu set,
  // otherwise roles without dashboard access will be sent to /403 by a hard-coded fallback.
  return <Navigate to={getUserHomePath(user)} replace />;
};

const App: React.FC = () => {
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<PrivateRoute />}>
          <Route element={<BasicLayout />}>
            <Route index element={<HomeRedirect />} />
            <Route path="dashboard" element={<Dashboard />} />
            <Route path="tenant" element={<TenantList />} />
            <Route path="user" element={<UserList />} />
            <Route path="role" element={<RoleList />} />
            <Route path="project" element={<ProjectList />} />
            <Route path="product" element={<ProductList />} />
            <Route path="protocol-parser" element={<ProtocolParserPage />} />
            <Route path="device" element={<DeviceList />} />
            <Route path="device-topology" element={<DeviceTopologyPage />} />
            <Route path="device-group" element={<DeviceGroupPage />} />
            <Route path="device-tag" element={<DeviceTagPage />} />
            <Route path="geo-fence" element={<GeoFencePage />} />
            <Route path="firmware" element={<FirmwarePage />} />
            <Route path="export" element={<ExportPage />} />
            <Route path="device-log" element={<DeviceLogPage />} />
            <Route path="message-template" element={<MessageTemplatePage />} />
            <Route path="monitor" element={<SystemMonitorPage />} />
            <Route path="permission" element={<PermissionResourcePage />} />
            <Route path="system-menu-permission" element={<SystemMenuPermissionPage />} />
            <Route path="menu-customization" element={<WorkspaceMenuCustomizationPage />} />
            <Route path="dict" element={<DictPage />} />
            <Route path="rule-engine" element={<RuleEngineList />} />
            <Route path="alarm-rules" element={<AlarmRulePage />} />
            <Route path="alarm-records" element={<AlarmRecordPage />} />
            <Route path="alarm-recipient-groups" element={<AlarmRecipientGroupPage />} />
            <Route path="ota" element={<OtaList />} />
            <Route path="device-data" element={<DeviceDataPage />} />
            <Route path="video" element={<VideoList />} />
            <Route path="audit-log" element={<AuditLogPage />} />
            <Route path="settings" element={<SystemSettingsPage />} />
            <Route path="open-api" element={<OpenApiPage />} />
            <Route path="notification" element={<NotificationPage />} />
            <Route path="notification-records" element={<NotificationRecordPage />} />
            <Route path="share" element={<SharePage />} />
            <Route path="analysis" element={<DataAnalysisPage />} />
            <Route path="operation-log" element={<OperationLogPage />} />
            <Route path="app-key" element={<ApiKeyPage />} />
            <Route path="security" element={<SecurityPage />} />
            <Route path="device-shadow" element={<DeviceShadowPage />} />
            <Route path="device-message" element={<DeviceMessagePage />} />
            <Route path="scheduled-task" element={<ScheduledTaskPage />} />
            <Route path="snmp" element={<SnmpPage />} />
            <Route path="modbus" element={<ModbusPage />} />
            <Route path="websocket" element={<WebSocketPage />} />
            <Route path="tcp-udp" element={<TcpUdpPage />} />
            <Route path="lorawan" element={<LoRaWanPage />} />
            <Route path="403" element={<ForbiddenPage />} />
            <Route path="*" element={<HomeRedirect />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
};

export default App;
