import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Select, Space, Table, Tag, Typography, message, Modal } from 'antd';
import { DeleteOutlined, PlusOutlined, TeamOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import { alarmRecipientGroupApi, userApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import { ALARM_TEXT } from './alarmText';

const { TextArea } = Input;

interface RecipientUserOption {
  username: string;
  realName?: string;
}

interface RecipientGroupRecord {
  code: string;
  name: string;
  description?: string;
  memberCount?: number;
  memberUsernames?: string[];
  members?: RecipientUserOption[];
  updatedAt?: string;
}

interface RecipientGroupFormValues {
  name: string;
  description?: string;
  memberUsernames?: string[];
}

const AlarmRecipientGroupPage: React.FC = () => {
  const hasPermission = useAuthStore((state) => state.hasPermission);
  const [data, setData] = useState<RecipientGroupRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [open, setOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [userOptions, setUserOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [form] = Form.useForm<RecipientGroupFormValues>();

  const canManage = hasPermission('alarm:update');

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await alarmRecipientGroupApi.list({
        ...params,
        keyword: keyword || undefined,
      });
      const page = res.data.data;
      setData(page.records || []);
      setTotal(page.total || 0);
    } catch {
      message.error(ALARM_TEXT.loadRecipientGroupError);
    } finally {
      setLoading(false);
    }
  };

  const loadUsers = async () => {
    try {
      const res = await userApi.options();
      const records = (res.data.data || []) as RecipientUserOption[];
      setUserOptions(
        records.map((item) => ({
          value: item.username,
          label: item.realName ? `${item.realName} (@${item.username})` : item.username,
        })),
      );
    } catch {
      message.error(ALARM_TEXT.loadNotifyOptionsError);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [params.pageNum, params.pageSize, keyword]);

  useEffect(() => {
    void loadUsers();
  }, []);

  const stats = useMemo(
    () => ({
      groupCount: total,
      memberCount: data.reduce((sum, item) => sum + (item.memberCount || 0), 0),
    }),
    [data, total],
  );

  const openCreate = () => {
    setEditingCode(null);
    form.setFieldsValue({ name: '', description: '', memberUsernames: [] });
    setOpen(true);
  };

  const openEdit = async (record: RecipientGroupRecord) => {
    try {
      const res = await alarmRecipientGroupApi.get(record.code);
      const detail = res.data.data as RecipientGroupRecord;
      setEditingCode(record.code);
      form.setFieldsValue({
        name: detail.name,
        description: detail.description,
        memberUsernames: detail.memberUsernames || [],
      });
      setOpen(true);
    } catch {
      message.error(ALARM_TEXT.loadRecipientGroupError);
    }
  };

  const handleSubmit = async (values: RecipientGroupFormValues) => {
    try {
      const payload = {
        name: values.name,
        description: values.description,
        memberUsernames: values.memberUsernames || [],
      };
      if (editingCode) {
        await alarmRecipientGroupApi.update(editingCode, payload);
        message.success(ALARM_TEXT.updateRecipientGroupSuccess);
      } else {
        await alarmRecipientGroupApi.create(payload);
        message.success(ALARM_TEXT.createRecipientGroupSuccess);
      }
      setOpen(false);
      setEditingCode(null);
      form.resetFields();
      await fetchData();
    } catch {
      message.error(editingCode ? ALARM_TEXT.updateRecipientGroupError : ALARM_TEXT.createRecipientGroupError);
    }
  };

  const handleDelete = (record: RecipientGroupRecord) => {
    Modal.confirm({
      title: ALARM_TEXT.deleteRecipientGroupTitle,
      content: `${ALARM_TEXT.deleteRecipientGroupMessagePrefix}${record.name}${ALARM_TEXT.deleteRecipientGroupMessageSuffix}`,
      onOk: async () => {
        try {
          await alarmRecipientGroupApi.delete(record.code);
          message.success(ALARM_TEXT.deleteRecipientGroupSuccess);
          await fetchData();
        } catch {
          message.error(ALARM_TEXT.deleteRecipientGroupError);
        }
      },
    });
  };

  const columns: ColumnsType<RecipientGroupRecord> = [
    {
      title: ALARM_TEXT.recipientGroupName,
      dataIndex: 'name',
      width: 220,
      render: (value: string, record: RecipientGroupRecord) => (
        <Space direction="vertical" size={2}>
          <Typography.Text strong>{value}</Typography.Text>
          <Typography.Text type="secondary">{record.description || '-'}</Typography.Text>
        </Space>
      ),
    },
    {
      title: ALARM_TEXT.recipientGroupMemberCount,
      dataIndex: 'memberCount',
      width: 120,
      render: (value?: number) => value || 0,
    },
    {
      title: ALARM_TEXT.recipientGroupMemberPreview,
      width: 360,
      render: (_: unknown, record: RecipientGroupRecord) => {
        const members = record.members || [];
        if (members.length === 0) {
          return '-';
        }
        return (
          <Space size={[4, 4]} wrap>
            {members.map((item) => (
              <Tag key={item.username}>{item.realName ? `${item.realName} (@${item.username})` : item.username}</Tag>
            ))}
          </Space>
        );
      },
    },
    {
      title: ALARM_TEXT.updatedAt || '更新时间',
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => value || '-',
    },
    {
      title: ALARM_TEXT.action,
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: RecipientGroupRecord) =>
        canManage ? (
          <Space>
            <Button type="link" size="small" onClick={() => void openEdit(record)}>
              {ALARM_TEXT.edit}
            </Button>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} onClick={() => handleDelete(record)}>
              {ALARM_TEXT.remove}
            </Button>
          </Space>
        ) : (
          '-'
        ),
    },
  ];

  return (
    <div>
      <PageHeader
        title={ALARM_TEXT.recipientGroupTitle}
        description={ALARM_TEXT.recipientGroupDescription}
        extra={
          canManage ? (
            <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
              {ALARM_TEXT.createRecipientGroup}
            </Button>
          ) : undefined
        }
      />

      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <Card style={{ borderRadius: 12 }}>
          <Space size={32}>
            <Space>
              <TeamOutlined style={{ color: '#1677ff' }} />
              <span>{`${ALARM_TEXT.recipientGroupTitle}：${stats.groupCount}`}</span>
            </Space>
            <Space>
              <TeamOutlined style={{ color: '#13a8a8' }} />
              <span>{`${ALARM_TEXT.recipientGroupMembers}：${stats.memberCount}`}</span>
            </Space>
          </Space>
        </Card>

        <Card style={{ borderRadius: 12 }}>
          <Space wrap>
            <Input.Search
              allowClear
              placeholder={ALARM_TEXT.recipientGroupSearch}
              style={{ width: 260 }}
              onSearch={(value) => {
                setKeyword(value);
                setParams((current) => ({ ...current, pageNum: 1 }));
              }}
            />
          </Space>
        </Card>

        <Card style={{ borderRadius: 12 }}>
          <Table
            rowKey="code"
            columns={columns}
            dataSource={data}
            loading={loading}
            locale={{ emptyText: ALARM_TEXT.recipientGroupEmpty }}
            scroll={{ x: 1080 }}
            pagination={{
              current: params.pageNum,
              pageSize: params.pageSize,
              total,
              showSizeChanger: true,
              showTotal: (count: number) => `共 ${count} ${ALARM_TEXT.countSuffix}`,
              onChange: (page: number, pageSize: number) => setParams({ pageNum: page, pageSize }),
            }}
          />
        </Card>
      </Space>

      <Drawer
        title={editingCode ? ALARM_TEXT.editRecipientGroup : ALARM_TEXT.createRecipientGroup}
        open={open}
        onClose={() => {
          setOpen(false);
          setEditingCode(null);
        }}
        width={720}
        destroyOnClose
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button
              onClick={() => {
                setOpen(false);
                setEditingCode(null);
              }}
            >
              {ALARM_TEXT.close}
            </Button>
            <Button type="primary" onClick={() => form.submit()}>
              {editingCode ? ALARM_TEXT.edit : ALARM_TEXT.createRecipientGroup}
            </Button>
          </Space>
        }
      >
        <Form form={form} layout="vertical" onFinish={handleSubmit}>
          <Form.Item
            name="name"
            label={ALARM_TEXT.recipientGroupName}
            rules={[{ required: true, message: ALARM_TEXT.recipientGroupNameRequired }]}
          >
            <Input maxLength={128} placeholder={ALARM_TEXT.recipientGroupNamePlaceholder} />
          </Form.Item>
          <Form.Item name="description" label={ALARM_TEXT.recipientGroupDescriptionLabel}>
            <TextArea rows={3} maxLength={500} placeholder={ALARM_TEXT.recipientGroupDescriptionPlaceholder} />
          </Form.Item>
          <Form.Item name="memberUsernames" label={ALARM_TEXT.recipientGroupMembers}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={userOptions}
              placeholder={ALARM_TEXT.recipientGroupMembersPlaceholder}
              notFoundContent={ALARM_TEXT.noSelectableUsers}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  );
};

export default AlarmRecipientGroupPage;
