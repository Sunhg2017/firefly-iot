import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Button, Card, Input, Space, Switch, Table, Tabs, Tag, Typography, message } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { systemConfigApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';

const { TextArea } = Input;

interface ConfigItem {
  id: number;
  configGroup: string;
  configKey: string;
  configValue: string;
  valueType: string;
  description: string;
  updatedAt: string;
  sourceLabel?: string;
}

interface PermissionItem {
  id: number;
  code: string;
  name: string;
  type: string;
  description?: string;
}

interface TenantAdminPermissionSettings {
  permissions: string[];
  source?: string;
  availablePermissions: PermissionItem[];
}

interface ConfigTabProps {
  isSystemOps?: boolean;
}

const groupLabels: Record<string, string> = {
  platform: '????',
  security: '????',
  notification: '????',
  custom: '?????',
};

const normalizeStringArray = (value: unknown): string[] => {
  if (!Array.isArray(value)) {
    return [];
  }
  return Array.from(
    new Set(
      value
        .filter((item): item is string => typeof item === 'string')
        .map((item) => item.trim())
        .filter((item) => item.length > 0),
    ),
  );
};

const tryFormatJsonString = (value: string | null | undefined): string => {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(rawValue), null, 2);
  } catch {
    return typeof value === 'string' ? value : '';
  }
};

const parseJsonConfigValue = (value: string): { parsed: unknown; formatted: string } => {
  const rawValue = value.trim();
  if (!rawValue) {
    throw new Error('JSON ??????');
  }
  const parsed = JSON.parse(rawValue);
  return {
    parsed,
    formatted: JSON.stringify(parsed, null, 2),
  };
};

const getErrorText = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const getEditableConfigValue = (item: ConfigItem): string => {
  if (item.valueType === 'JSON') {
    return tryFormatJsonString(item.configValue);
  }
  return item.configValue || '';
};

const TENANT_ADMIN_DEFAULT_PERMISSIONS_KEY = 'tenant.admin.default-permissions';

const tenantAdminPermissionSourceLabels: Record<string, string> = {
  SYSTEM_SETTINGS: '????',
  APPLICATION_DEFAULT: '?????',
};

const mergeTenantAdminConfig = (
  groups: Record<string, ConfigItem[]>,
  settings?: Partial<TenantAdminPermissionSettings> | null,
): Record<string, ConfigItem[]> => {
  if (!settings) {
    return groups;
  }

  const permissions = normalizeStringArray(settings.permissions);
  const sourceLabel = tenantAdminPermissionSourceLabels[settings.source || ''] || '?????';
  const item: ConfigItem = {
    id: -1,
    configGroup: 'platform',
    configKey: TENANT_ADMIN_DEFAULT_PERMISSIONS_KEY,
    configValue: JSON.stringify(permissions, null, 2),
    valueType: 'JSON',
    description: '??????????(JSON ????????????"?????"????)',
    updatedAt: '',
    sourceLabel,
  };

  const nextGroups: Record<string, ConfigItem[]> = { ...groups };
  const platformItems = Array.isArray(nextGroups.platform) ? nextGroups.platform : [];
  nextGroups.platform = [...platformItems.filter((config) => config.configKey !== TENANT_ADMIN_DEFAULT_PERMISSIONS_KEY), item].sort(
    (left, right) => left.configKey.localeCompare(right.configKey),
  );
  return nextGroups;
};

const ConfigTab: React.FC<ConfigTabProps> = ({ isSystemOps = false }) => {
  const [groups, setGroups] = useState<Record<string, ConfigItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingHistory, setEditingHistory] = useState<string[]>([]);

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const [configRes, tenantAdminRes] = await Promise.all([
        systemConfigApi.list(),
        isSystemOps ? systemConfigApi.getTenantAdminDefaultPermissions().catch(() => null) : Promise.resolve(null),
      ]);

      const configGroups = (configRes.data?.data as Record<string, ConfigItem[]>) || {};
      const tenantAdminSettings = (tenantAdminRes?.data?.data || null) as Partial<TenantAdminPermissionSettings> | null;
      setGroups(isSystemOps ? mergeTenantAdminConfig(configGroups, tenantAdminSettings) : configGroups);
    } catch {
      message.error('????????');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfigs();
  }, []);

  const updateEditingValue = (nextValue: string) => {
    if (editingValue === nextValue) {
      return;
    }
    setEditingHistory((history) => [...history, editingValue]);
    setEditingValue(nextValue);
  };

  const handleUndoEdit = () => {
    if (editingHistory.length === 0) {
      return;
    }
    const previousValue = editingHistory[editingHistory.length - 1];
    setEditingHistory((history) => history.slice(0, -1));
    setEditingValue(previousValue);
  };

  const resetEditingState = () => {
    setEditingKey(null);
    setEditingValue('');
    setEditingHistory([]);
  };

  const startEditing = (item: ConfigItem) => {
    setEditingKey(item.configKey);
    setEditingValue(getEditableConfigValue(item));
    setEditingHistory([]);
  };

  const handleFormatJson = () => {
    try {
      const { formatted } = parseJsonConfigValue(editingValue);
      updateEditingValue(formatted);
    } catch (error) {
      message.error(getErrorText(error, 'JSON ?????'));
    }
  };

  const handleCompactJson = () => {
    try {
      const { parsed } = parseJsonConfigValue(editingValue);
      updateEditingValue(JSON.stringify(parsed));
    } catch (error) {
      message.error(getErrorText(error, 'JSON ????'));
    }
  };

  const handleSave = async (item: ConfigItem) => {
    try {
      if (item.valueType === 'JSON') {
        const { parsed, formatted } = parseJsonConfigValue(editingValue);
        updateEditingValue(formatted);

        if (item.configKey === TENANT_ADMIN_DEFAULT_PERMISSIONS_KEY) {
          if (!Array.isArray(parsed)) {
            message.error('?????? JSON ?????');
            return;
          }
          const permissions = normalizeStringArray(parsed);
          if (permissions.length === 0) {
            message.error('???????????????????');
            return;
          }
          await systemConfigApi.updateTenantAdminDefaultPermissions(permissions);
        } else {
          await systemConfigApi.update({ configKey: item.configKey, configValue: formatted });
        }
      } else {
        await systemConfigApi.update({ configKey: item.configKey, configValue: editingValue });
      }

      message.success('?????');
      resetEditingState();
      await fetchConfigs();
    } catch (error) {
      message.error(getErrorText(error, '??????'));
    }
  };

  const columns: ColumnsType<ConfigItem> = [
    { title: '???', dataIndex: 'configKey', width: 280, ellipsis: true },
    {
      title: '??',
      dataIndex: 'valueType',
      width: 100,
      render: (value: string) => <Tag>{value || 'STRING'}</Tag>,
    },
    {
      title: '??',
      dataIndex: 'sourceLabel',
      width: 120,
      render: (value: string | undefined, record) => {
        if (record.configKey === TENANT_ADMIN_DEFAULT_PERMISSIONS_KEY && value) {
          return <Tag color={value === '????' ? 'blue' : 'default'}>{value}</Tag>;
        }
        return null;
      },
    },
    {
      title: '???',
      dataIndex: 'configValue',
      width: 360,
      render: (_value: unknown, record) => {
        if (editingKey === record.configKey) {
          if (record.valueType === 'BOOLEAN') {
            return <Switch checked={editingValue === 'true'} onChange={(checked) => updateEditingValue(String(checked))} />;
          }
          if (record.valueType === 'JSON') {
            return (
              <Space direction="vertical" size={4} style={{ width: 320 }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <Space size={12}>
                    <Button
                      type="link"
                      size="small"
                      onClick={handleUndoEdit}
                      disabled={editingHistory.length === 0}
                      style={{ paddingInline: 0 }}
                    >
                      ?????
                    </Button>
                    <Button
                      type="link"
                      size="small"
                      onClick={() => updateEditingValue(getEditableConfigValue(record))}
                      style={{ paddingInline: 0 }}
                    >
                      ????
                    </Button>
                    <Button type="link" size="small" onClick={handleCompactJson} style={{ paddingInline: 0 }}>
                      ??
                    </Button>
                    <Button type="link" size="small" onClick={handleFormatJson} style={{ paddingInline: 0 }}>
                      ???
                    </Button>
                  </Space>
                </div>
                <TextArea
                  value={editingValue}
                  onChange={(event) => updateEditingValue(event.target.value)}
                  autoSize={{ minRows: 4, maxRows: 8 }}
                  style={{ width: 320, fontFamily: 'monospace', fontSize: 12 }}
                />
              </Space>
            );
          }
          return (
            <Input
              value={editingValue}
              onChange={(event) => updateEditingValue(event.target.value)}
              style={{ width: 260 }}
            />
          );
        }

        if (record.valueType === 'BOOLEAN') {
          return <Tag color={record.configValue === 'true' ? 'success' : 'default'}>{record.configValue === 'true' ? '?' : '?'}</Tag>;
        }
        if (record.valueType === 'JSON') {
          return (
            <Typography.Paragraph
              copyable={{ text: record.configValue || '[]' }}
              style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontFamily: 'monospace', fontSize: 12 }}
            >
              {record.configValue || '[]'}
            </Typography.Paragraph>
          );
        }
        return record.configValue || '-';
      },
    },
    { title: '??', dataIndex: 'description', ellipsis: true },
    {
      title: '??',
      width: 130,
      fixed: 'right',
      render: (_value: unknown, record) => {
        if (editingKey === record.configKey) {
          return (
            <Space>
              <Button type="link" size="small" icon={<SaveOutlined />} onClick={() => void handleSave(record)}>
                ??
              </Button>
              <Button type="link" size="small" onClick={resetEditingState}>
                ??
              </Button>
            </Space>
          );
        }
        return (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            onClick={() => {
              startEditing(record);
            }}
          >
            ??
          </Button>
        );
      },
    },
  ];

  return (
    <div>
      {Object.entries(groups).map(([group, items]) => (
        <Card key={group} title={groupLabels[group] || group} style={{ marginBottom: 16 }} size="small">
          <Table
            rowKey="configKey"
            columns={columns}
            dataSource={items}
            loading={loading}
            pagination={false}
            size="small"
            scroll={{ x: 1040 }}
          />
        </Card>
      ))}
      {Object.keys(groups).length === 0 && !loading && (
        <Card>
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>??????</div>
        </Card>
      )}
    </div>
  );
};

const TenantAdminPermissionTab: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedPermissions, setSelectedPermissions] = useState<string[]>([]);
  const [availablePermissions, setAvailablePermissions] = useState<PermissionItem[]>([]);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await systemConfigApi.getTenantAdminDefaultPermissions();
      const payload = (res.data?.data || {}) as Partial<TenantAdminPermissionSettings>;
      setSelectedPermissions(normalizeStringArray(payload.permissions));
      setAvailablePermissions(Array.isArray(payload.availablePermissions) ? payload.availablePermissions : []);
    } catch {
      message.error('??????????');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchSettings();
  }, []);

  const allPermissionCodes = useMemo(
    () => availablePermissions.map((item) => item.code).filter((item) => typeof item === 'string' && item.trim().length > 0),
    [availablePermissions],
  );

  const handleSave = async () => {
    const normalizedPermissions = normalizeStringArray(selectedPermissions);
    if (normalizedPermissions.length === 0) {
      message.error('????????');
      return;
    }

    setSaving(true);
    try {
      await systemConfigApi.updateTenantAdminDefaultPermissions(normalizedPermissions);
      setSelectedPermissions(normalizedPermissions);
      message.success('???????');
      await fetchSettings();
    } catch {
      message.error('????????');
    } finally {
      setSaving(false);
    }
  };

  const columns: ColumnsType<PermissionItem> = [
    { title: '????', dataIndex: 'name', width: 220, ellipsis: true },
    { title: '????', dataIndex: 'code', width: 240, ellipsis: true },
    { title: '??', dataIndex: 'type', width: 120, render: (value: string) => <Tag>{value || '-'}</Tag> },
    { title: '??', dataIndex: 'description', ellipsis: true },
  ];

  return (
    <Card
      size="small"
      title="??????????"
      extra={
        <Space size={8}>
          <Typography.Text type="secondary">?? {selectedPermissions.length} / ?? {allPermissionCodes.length} ?</Typography.Text>
          <Button size="small" onClick={() => setSelectedPermissions(allPermissionCodes)} disabled={loading || allPermissionCodes.length === 0}>
            ??
          </Button>
          <Button size="small" onClick={() => setSelectedPermissions([])} disabled={loading || selectedPermissions.length === 0}>
            ??
          </Button>
          <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => void handleSave()} loading={saving}>
            ??
          </Button>
        </Space>
      }
    >
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Alert type="info" showIcon message="???????????????????????????????" />
        <Table
          rowKey="code"
          columns={columns}
          dataSource={availablePermissions}
          loading={loading}
          pagination={false}
          size="small"
          scroll={{ x: 980, y: 520 }}
          rowSelection={{
            selectedRowKeys: selectedPermissions,
            onChange: (selectedRowKeys) => setSelectedPermissions(selectedRowKeys.map((item) => String(item))),
          }}
        />
      </Space>
    </Card>
  );
};

const SystemSettingsPage: React.FC = () => {
  const user = useAuthStore((state) => state.user);
  const isSystemOps = user?.userType === 'SYSTEM_OPS';

  const tabItems = [
    { key: 'config', label: '????', children: <ConfigTab isSystemOps={isSystemOps} /> },
    ...(isSystemOps ? [{ key: 'tenant-admin', label: '?????', children: <TenantAdminPermissionTab /> }] : []),
  ];

  return (
    <div>
      <PageHeader title="????" />
      <Tabs defaultActiveKey="config" style={{ marginTop: 16 }} items={tabItems} />
    </div>
  );
};

export default SystemSettingsPage;
