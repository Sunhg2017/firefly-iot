import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Input, Space, Switch, Table, Tag, Typography, message } from 'antd';
import { EditOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { systemConfigApi } from '../../services/api';

const { TextArea } = Input;

interface ConfigItem {
  id: number;
  configGroup: string;
  configKey: string;
  configValue: string;
  valueType: string;
  description: string;
  updatedAt: string;
}

const GROUP_LABELS: Record<string, string> = {
  platform: '平台配置',
  security: '安全配置',
  notification: '通知配置',
  custom: '自定义配置',
};

const getErrorText = (error: unknown, fallback: string): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return fallback;
};

const prettyJson = (value?: string | null): string => {
  const rawValue = typeof value === 'string' ? value.trim() : '';
  if (!rawValue) {
    return '';
  }
  try {
    return JSON.stringify(JSON.parse(rawValue), null, 2);
  } catch {
    return value ?? '';
  }
};

const parseJson = (value: string) => {
  const rawValue = value.trim();
  if (!rawValue) {
    throw new Error('JSON 不能为空');
  }
  const parsed = JSON.parse(rawValue);
  return JSON.stringify(parsed, null, 2);
};

const SystemSettingsPage: React.FC = () => {
  const [groups, setGroups] = useState<Record<string, ConfigItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await systemConfigApi.list();
      setGroups((res.data?.data as Record<string, ConfigItem[]>) || {});
    } catch (error) {
      message.error(getErrorText(error, '加载系统配置失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfigs();
  }, []);

  const totalCount = useMemo(
    () => Object.values(groups).reduce((sum, items) => sum + items.length, 0),
    [groups],
  );

  const startEditing = (item: ConfigItem) => {
    setEditingKey(item.configKey);
    setEditingValue(item.valueType === 'JSON' ? prettyJson(item.configValue) : item.configValue || '');
  };

  const resetEditing = () => {
    setEditingKey(null);
    setEditingValue('');
  };

  const handleSave = async (item: ConfigItem) => {
    try {
      let configValue = editingValue;
      if (item.valueType === 'JSON') {
        configValue = parseJson(editingValue);
        setEditingValue(configValue);
      }
      await systemConfigApi.update({ configKey: item.configKey, configValue });
      message.success('配置已更新');
      resetEditing();
      await fetchConfigs();
    } catch (error) {
      message.error(getErrorText(error, '保存配置失败'));
    }
  };

  const columns: ColumnsType<ConfigItem> = [
    {
      title: '配置键',
      dataIndex: 'configKey',
      width: 280,
      ellipsis: true,
    },
    {
      title: '类型',
      dataIndex: 'valueType',
      width: 110,
      render: (value: string) => <Tag>{value || 'STRING'}</Tag>,
    },
    {
      title: '配置值',
      dataIndex: 'configValue',
      width: 420,
      render: (_value: string, record) => {
        if (editingKey === record.configKey) {
          if (record.valueType === 'BOOLEAN') {
            return (
              <Switch
                checked={editingValue === 'true'}
                onChange={(checked) => setEditingValue(String(checked))}
              />
            );
          }

          if (record.valueType === 'JSON') {
            return (
              <Space direction="vertical" size={8} style={{ width: '100%' }}>
                <Space size={4}>
                  <Button size="small" onClick={() => setEditingValue(prettyJson(editingValue))}>
                    格式化
                  </Button>
                  <Button
                    size="small"
                    onClick={() => {
                      try {
                        setEditingValue(JSON.stringify(JSON.parse(editingValue)));
                      } catch (error) {
                        message.error(getErrorText(error, 'JSON 解析失败'));
                      }
                    }}
                  >
                    压缩
                  </Button>
                </Space>
                <TextArea
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  autoSize={{ minRows: 5, maxRows: 10 }}
                  style={{ fontFamily: 'Consolas, Monaco, monospace' }}
                />
              </Space>
            );
          }

          return (
            <Input
              value={editingValue}
              onChange={(event) => setEditingValue(event.target.value)}
            />
          );
        }

        if (record.valueType === 'BOOLEAN') {
          return <Tag color={record.configValue === 'true' ? 'success' : 'default'}>{record.configValue === 'true' ? '开启' : '关闭'}</Tag>;
        }

        if (record.valueType === 'JSON') {
          return (
            <Typography.Paragraph
              style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontFamily: 'Consolas, Monaco, monospace' }}
              copyable={{ text: record.configValue || '{}' }}
            >
              {prettyJson(record.configValue) || '{}'}
            </Typography.Paragraph>
          );
        }

        return record.configValue || '-';
      },
    },
    {
      title: '说明',
      dataIndex: 'description',
      ellipsis: true,
    },
    {
      title: '操作',
      width: 140,
      fixed: 'right',
      render: (_value: string, record) => (
        editingKey === record.configKey ? (
          <Space>
            <Button type="link" size="small" icon={<SaveOutlined />} onClick={() => void handleSave(record)}>
              保存
            </Button>
            <Button type="link" size="small" onClick={resetEditing}>
              取消
            </Button>
          </Space>
        ) : (
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => startEditing(record)}>
            编辑
          </Button>
        )
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="系统设置"
        description={`当前共 ${totalCount} 项配置，页面仅保留正式生效的系统配置项，不再维护租户管理员默认权限这类过渡入口。`}
      />

      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
        {Object.entries(groups).map(([group, items]) => (
          <Card key={group} title={GROUP_LABELS[group] || group} size="small" bordered={false}>
            <Table
              rowKey="configKey"
              columns={columns}
              dataSource={items}
              loading={loading}
              pagination={false}
              size="small"
              scroll={{ x: 1100 }}
            />
          </Card>
        ))}
      </Space>
    </div>
  );
};

export default SystemSettingsPage;
