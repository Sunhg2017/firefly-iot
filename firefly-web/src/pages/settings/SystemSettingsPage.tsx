import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Input, Modal, Space, Switch, Table, Tag, Tooltip, Typography, message } from 'antd';
import { EditOutlined, EyeInvisibleOutlined, EyeOutlined, ReloadOutlined, SaveOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { useDirtyGuard } from '../../hooks/useDirtyGuard';
import { usePageActivation } from '../../hooks/usePageActivation';
import { systemConfigApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

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

const SENSITIVE_KEY_PATTERN = /(pem|private[_-]?key|public[_-]?key|secret|token|password|passwd|credential|access[_-]?key|api[_-]?key|apikey|cert)/i;

const isSensitiveConfigKey = (item: ConfigItem): boolean =>
  item.valueType !== 'BOOLEAN' && SENSITIVE_KEY_PATTERN.test(item.configKey);

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

const shouldUseMultilineEditor = (item: ConfigItem): boolean => {
  const key = item.configKey.toLowerCase();
  return key.includes('pem') || key.includes('private_key') || key.includes('public_key');
};

const maskValue = (value?: string | null): string => {
  if (!value) {
    return '-';
  }
  return '••••••••';
};

const SystemSettingsPage: React.FC = () => {
  const [groups, setGroups] = useState<Record<string, ConfigItem[]>>({});
  const [loading, setLoading] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editingValue, setEditingValue] = useState('');
  const [editingOriginal, setEditingOriginal] = useState('');
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [revealedKeys, setRevealedKeys] = useState<string[]>([]);
  const [pendingSave, setPendingSave] = useState<{ item: ConfigItem; value: string } | null>(null);
  const [pendingEditSwitch, setPendingEditSwitch] = useState<ConfigItem | null>(null);
  const [pendingCancel, setPendingCancel] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const isEditingDirty = editingKey !== null && editingValue !== editingOriginal;

  useDirtyGuard(isEditingDirty);
  // 布局在切换页签时会广播激活事件；忽略与首次挂载同一轮触发的事件，避免刚打开页面就请求两次。
  const activationReadyRef = useRef(false);
  useEffect(() => {
    const timer = window.setTimeout(() => {
      activationReadyRef.current = true;
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);
  usePageActivation(() => {
    if (!activationReadyRef.current) {
      return;
    }
    setReloadToken((current) => current + 1);
  });

  const fetchConfigs = async () => {
    setLoading(true);
    try {
      const res = await systemConfigApi.list();
      setGroups((res.data?.data as Record<string, ConfigItem[]>) || {});
    } catch (error) {
      message.error(getErrorMessage(error, '加载系统配置失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchConfigs();
  }, [reloadToken]);

  const totalCount = useMemo(
    () => Object.values(groups).reduce((sum, items) => sum + items.length, 0),
    [groups],
  );

  const loadEditingValue = (item: ConfigItem): string => (
    item.valueType === 'JSON' ? prettyJson(item.configValue) : item.configValue || ''
  );

  const startEditing = (item: ConfigItem) => {
    if (editingKey && editingKey !== item.configKey && isEditingDirty) {
      // 切行编辑会覆盖当前草稿，必须先让用户确认。
      setPendingEditSwitch(item);
      return;
    }
    applyStartEditing(item);
  };

  const applyStartEditing = (item: ConfigItem) => {
    const value = loadEditingValue(item);
    setEditingKey(item.configKey);
    setEditingValue(value);
    setEditingOriginal(value);
  };

  const resetEditing = () => {
    setEditingKey(null);
    setEditingValue('');
    setEditingOriginal('');
  };

  const requestCancelEditing = () => {
    if (isEditingDirty) {
      setPendingCancel(true);
      return;
    }
    resetEditing();
  };

  const persistSave = async (item: ConfigItem, rawValue: string): Promise<boolean> => {
    setSavingKey(item.configKey);
    try {
      let configValue = rawValue;
      if (item.valueType === 'JSON') {
        configValue = parseJson(rawValue);
        setEditingValue(configValue);
      }
      await systemConfigApi.update({ configKey: item.configKey, configValue });
      message.success('配置已更新');
      // 保存后重新掩码，避免敏感值一直停留在明文展示状态。
      setRevealedKeys((current) => current.filter((key) => key !== item.configKey));
      resetEditing();
      await fetchConfigs();
      return true;
    } catch (error) {
      // 失败时保留编辑状态和已输入内容，避免用户重新填写。
      message.error(getErrorMessage(error, '保存配置失败'));
      return false;
    } finally {
      setSavingKey(null);
    }
  };

  const handleSave = async (item: ConfigItem) => {
    try {
      const normalizedValue = item.valueType === 'JSON' ? parseJson(editingValue) : editingValue;
      if (isSensitiveConfigKey(item)) {
        setPendingSave({ item, value: normalizedValue });
        return;
      }
      await persistSave(item, normalizedValue);
    } catch (error) {
      message.error(getErrorMessage(error, 'JSON 解析失败'));
    }
  };

  const toggleReveal = (configKey: string) => {
    setRevealedKeys((current) => (
      current.includes(configKey) ? current.filter((key) => key !== configKey) : [...current, configKey]
    ));
  };

  const columns: ColumnsType<ConfigItem> = [
    {
      title: '配置键',
      dataIndex: 'configKey',
      width: 300,
      ellipsis: true,
      render: (value: string, record) => (
        <Space size={6} wrap>
          <Typography.Text>{value}</Typography.Text>
          {isSensitiveConfigKey(record) ? (
            <Tooltip title="包含密钥、口令或令牌，展示和保存都会受到保护">
              <Tag color="red">敏感</Tag>
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
    {
      title: '类型',
      dataIndex: 'valueType',
      width: 100,
      render: (value: string) => <Tag>{value || 'STRING'}</Tag>,
    },
    {
      title: '配置值',
      dataIndex: 'configValue',
      width: 430,
      render: (_value: string, record) => {
        const sensitive = isSensitiveConfigKey(record);
        const revealed = revealedKeys.includes(record.configKey);

        if (editingKey === record.configKey) {
          if (record.valueType === 'BOOLEAN') {
            return (
              <Switch
                checked={editingValue === 'true'}
                disabled={savingKey === record.configKey}
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
                        message.error(getErrorMessage(error, 'JSON 解析失败'));
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
                {sensitive ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    敏感配置：保存前会要求再次确认。
                  </Typography.Text>
                ) : null}
              </Space>
            );
          }

          if (shouldUseMultilineEditor(record)) {
            return (
              <Space direction="vertical" size={6} style={{ width: '100%' }}>
                <TextArea
                  value={editingValue}
                  onChange={(event) => setEditingValue(event.target.value)}
                  autoSize={{ minRows: 5, maxRows: 10 }}
                  style={{ fontFamily: 'Consolas, Monaco, monospace' }}
                />
                {sensitive ? (
                  <Typography.Text type="secondary" style={{ fontSize: 12 }}>
                    敏感配置：保存前会要求再次确认。
                  </Typography.Text>
                ) : null}
              </Space>
            );
          }

          return sensitive ? (
            <Input.Password
              value={editingValue}
              visibilityToggle
              onChange={(event) => setEditingValue(event.target.value)}
            />
          ) : (
            <Input
              value={editingValue}
              onChange={(event) => setEditingValue(event.target.value)}
            />
          );
        }

        if (record.valueType === 'BOOLEAN') {
          return <Tag color={record.configValue === 'true' ? 'success' : 'default'}>{record.configValue === 'true' ? '开启' : '关闭'}</Tag>;
        }

        if (sensitive && !revealed) {
          return (
            <Space size={8}>
              <Typography.Text style={{ fontFamily: 'Consolas, Monaco, monospace' }}>
                {maskValue(record.configValue)}
              </Typography.Text>
              <Button
                type="link"
                size="small"
                icon={<EyeOutlined />}
                onClick={() => toggleReveal(record.configKey)}
              >
                查看
              </Button>
            </Space>
          );
        }

        const displayContent = record.valueType === 'JSON'
          ? (prettyJson(record.configValue) || '{}')
          : (record.configValue || '-');

        return (
          <Space direction="vertical" size={4} style={{ width: '100%' }}>
            <Typography.Paragraph
              style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontFamily: 'Consolas, Monaco, monospace' }}
              copyable={{ text: record.configValue || '' }}
            >
              {displayContent}
            </Typography.Paragraph>
            {sensitive ? (
              <Button
                type="link"
                size="small"
                icon={<EyeInvisibleOutlined />}
                style={{ padding: 0, alignSelf: 'flex-start' }}
                onClick={() => toggleReveal(record.configKey)}
              >
                隐藏
              </Button>
            ) : null}
          </Space>
        );
      },
    },
    {
      title: '说明',
      dataIndex: 'description',
      ellipsis: true,
      render: (value?: string) => value || '-',
    },
    {
      title: '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => (value ? formatDateTime(value) : '-'),
    },
    {
      title: '操作',
      width: 150,
      fixed: 'right',
      render: (_value: string, record) => (
        editingKey === record.configKey ? (
          <Space>
            <Button
              type="link"
              size="small"
              icon={<SaveOutlined />}
              loading={savingKey === record.configKey}
              disabled={savingKey !== null && savingKey !== record.configKey}
              onClick={() => void handleSave(record)}
            >
              保存
            </Button>
            <Button
              type="link"
              size="small"
              disabled={savingKey === record.configKey}
              onClick={requestCancelEditing}
            >
              取消
            </Button>
          </Space>
        ) : (
          <Button
            type="link"
            size="small"
            icon={<EditOutlined />}
            disabled={savingKey !== null || pendingSave !== null || pendingEditSwitch !== null}
            onClick={() => startEditing(record)}
          >
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
        description={`当前共 ${totalCount} 项配置，可按分组查看和编辑生效参数。`}
        extra={(
          <Button icon={<ReloadOutlined />} loading={loading} onClick={() => setReloadToken((current) => current + 1)}>
            刷新
          </Button>
        )}
      />

      {editingKey && isEditingDirty ? (
        <Alert
          type="warning"
          showIcon
          style={{ marginTop: 16 }}
          message="当前配置有未保存的修改"
          description="切换到其他配置或离开页面会丢失本次修改，请先保存或取消。"
        />
      ) : null}

      <Space direction="vertical" size={16} style={{ width: '100%', marginTop: 16 }}>
        {totalCount === 0 && !loading ? (
          <Card bordered={false}>
            <ListEmpty emptyText="暂无可配置项" />
          </Card>
        ) : null}
        {Object.entries(groups).map(([group, items]) => (
          <Card key={group} title={GROUP_LABELS[group] || group} size="small" bordered={false}>
            <Table
              rowKey="configKey"
              columns={columns}
              dataSource={items}
              loading={loading}
              pagination={false}
              size="small"
              scroll={{ x: 1260 }}
              locale={{ emptyText: <ListEmpty compact emptyText="该分组暂无配置项" /> }}
            />
          </Card>
        ))}
      </Space>

      <Modal
        open={Boolean(pendingSave)}
        title="确认保存敏感配置"
        okText="确认保存"
        cancelText="取消"
        confirmLoading={Boolean(pendingSave && savingKey === pendingSave.item.configKey)}
        maskClosable={savingKey === null}
        onCancel={() => {
          if (savingKey === null) {
            setPendingSave(null);
          }
        }}
        onOk={() => {
          if (!pendingSave) {
            return;
          }
          const target = pendingSave;
          // 保存失败时保持确认弹窗打开并保留输入，便于用户重试；成功后才关闭。
          void persistSave(target.item, target.value).then((saved) => {
            if (saved) {
              setPendingSave(null);
            }
          });
        }}
        destroyOnClose
      >
        {pendingSave ? (
          <Space direction="vertical" size={8}>
            <Typography.Text>
              配置键：<Typography.Text code>{pendingSave.item.configKey}</Typography.Text>
            </Typography.Text>
            <Alert
              type="warning"
              showIcon
              message="保存后立即生效"
              description="该配置包含密钥、口令或令牌。新值保存后会立即影响登录、证书校验或第三方对接；请确认已备份原值并核对新内容。"
            />
            <Typography.Text type="secondary">
              保存后列表仍以掩码展示，需要查看时请再次点击“查看”。
            </Typography.Text>
          </Space>
        ) : null}
      </Modal>

      <Modal
        open={Boolean(pendingEditSwitch)}
        title="放弃未保存的修改？"
        okText="放弃修改"
        cancelText="继续编辑"
        okButtonProps={{ danger: true }}
        onCancel={() => setPendingEditSwitch(null)}
        onOk={() => {
          if (pendingEditSwitch) {
            applyStartEditing(pendingEditSwitch);
          }
          setPendingEditSwitch(null);
        }}
        destroyOnClose
      >
        <Typography.Text>
          当前配置有未保存的修改，切换到其他配置后本次修改将丢失且无法恢复。
        </Typography.Text>
      </Modal>

      <Modal
        open={pendingCancel}
        title="放弃未保存的修改？"
        okText="放弃修改"
        cancelText="继续编辑"
        okButtonProps={{ danger: true }}
        onCancel={() => setPendingCancel(false)}
        onOk={() => {
          setPendingCancel(false);
          resetEditing();
        }}
        destroyOnClose
      >
        <Typography.Text>取消编辑后本次输入的内容将丢失且无法恢复。</Typography.Text>
      </Modal>
    </div>
  );
};

export default SystemSettingsPage;
