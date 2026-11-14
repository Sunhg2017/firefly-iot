import React, { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, Drawer, Form, Input, Modal, Select, Space, Table, Tag, Typography, message } from 'antd';
import { DeleteOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { alarmRecipientGroupApi, userApi } from '../../services/api';
import useAuthStore from '../../store/useAuthStore';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';
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
  const [loadError, setLoadError] = useState<string | null>(null);
  const [params, setParams] = useState({ pageNum: 1, pageSize: 20 });
  const [keyword, setKeyword] = useState('');
  const [keywordInput, setKeywordInput] = useState('');
  const [open, setOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [userOptions, setUserOptions] = useState<Array<{ value: string; label: string }>>([]);
  const [submitting, setSubmitting] = useState(false);
  const [loadingCode, setLoadingCode] = useState<string | null>(null);
  const [userLoadError, setUserLoadError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [form] = Form.useForm<RecipientGroupFormValues>();
  const confirmDiscard = useConfirmDiscard();
  const submittingRef = useRef(false);
  const editingRequestRef = useRef(false);

  const canManage = hasPermission('alarm:update');
  const hasFilters = Boolean(keyword);

  useDirtyGuard(open && dirty);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await alarmRecipientGroupApi.list({
        ...params,
        keyword: keyword || undefined,
      });
      const page = res.data.data as { records?: RecipientGroupRecord[]; total?: number } | undefined;
      setData(page?.records || []);
      setTotal(page?.total || 0);
      setLoadError(null);
    } catch (error) {
      setLoadError(getErrorMessage(error, ALARM_TEXT.loadRecipientGroupError));
      setData([]);
      setTotal(0);
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
      setUserLoadError(null);
    } catch (error) {
      const errorMessage = getErrorMessage(error, ALARM_TEXT.loadRecipientUsersError);
      setUserLoadError(errorMessage);
      message.error(errorMessage);
    }
  };

  useEffect(() => {
    void fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.pageNum, params.pageSize, keyword]);

  useEffect(() => {
    void loadUsers();
  }, []);

  const closeDrawer = () => {
    if (submittingRef.current) {
      return;
    }
    setOpen(false);
    setEditingCode(null);
    setDirty(false);
    form.resetFields();
  };

  const requestCloseDrawer = () => {
    if (submittingRef.current) {
      return;
    }
    confirmDiscard(open && form.isFieldsTouched(), closeDrawer);
  };

  const openCreate = () => {
    setEditingCode(null);
    form.resetFields();
    form.setFieldsValue({ name: '', description: '', memberUsernames: [] });
    setDirty(false);
    setOpen(true);
  };

  const openEdit = async (record: RecipientGroupRecord) => {
    if (editingRequestRef.current) {
      return;
    }
    editingRequestRef.current = true;
    setLoadingCode(record.code);
    try {
      const res = await alarmRecipientGroupApi.get(record.code);
      const detail = res.data.data as RecipientGroupRecord;
      setEditingCode(record.code);
      form.setFieldsValue({
        name: detail.name,
        description: detail.description,
        memberUsernames: detail.memberUsernames || [],
      });
      setDirty(false);
      setOpen(true);
    } catch (error) {
      message.error(getErrorMessage(error, ALARM_TEXT.loadRecipientGroupError));
    } finally {
      editingRequestRef.current = false;
      setLoadingCode(null);
    }
  };

  const handleSubmit = async (values: RecipientGroupFormValues) => {
    if (submittingRef.current) {
      return;
    }
    submittingRef.current = true;
    setSubmitting(true);
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
      setDirty(false);
      form.resetFields();
      await fetchData();
    } catch (error) {
      message.error(
        getErrorMessage(error, editingCode ? ALARM_TEXT.updateRecipientGroupError : ALARM_TEXT.createRecipientGroupError),
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const handleDelete = (record: RecipientGroupRecord) => {
    Modal.confirm({
      title: ALARM_TEXT.deleteRecipientGroupTitle,
      content: `${ALARM_TEXT.deleteRecipientGroupMessagePrefix}${record.name}${ALARM_TEXT.deleteRecipientGroupMessageSuffix}`,
      okText: ALARM_TEXT.remove,
      okButtonProps: { danger: true },
      onOk: async () => {
        try {
          await alarmRecipientGroupApi.delete(record.code);
          message.success(ALARM_TEXT.deleteRecipientGroupSuccess);
          await fetchData();
        } catch (error) {
          message.error(getErrorMessage(error, ALARM_TEXT.deleteRecipientGroupError));
        }
      },
    });
  };

  const clearFilters = () => {
    setKeyword('');
    setKeywordInput('');
    setParams((current) => ({ ...current, pageNum: 1 }));
  };

  const columns: ColumnsType<RecipientGroupRecord> = [
    {
      title: ALARM_TEXT.recipientGroupName,
      dataIndex: 'name',
      width: 220,
      render: (value: string, record: RecipientGroupRecord) => (
        <Space direction="vertical" size={2} style={{ maxWidth: '100%' }}>
          <Typography.Text strong ellipsis={{ tooltip: value }}>
            {value}
          </Typography.Text>
          <Typography.Text type="secondary" ellipsis={{ tooltip: record.description }}>
            {record.description || '-'}
          </Typography.Text>
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
      title: ALARM_TEXT.updatedAt,
      dataIndex: 'updatedAt',
      width: 180,
      render: (value?: string) => formatDateTime(value),
    },
    {
      title: ALARM_TEXT.action,
      width: 160,
      fixed: 'right',
      render: (_: unknown, record: RecipientGroupRecord) =>
        canManage ? (
          <Space>
            <Button
              type="link"
              size="small"
              loading={loadingCode === record.code}
              disabled={Boolean(loadingCode)}
              onClick={() => void openEdit(record)}
            >
              {ALARM_TEXT.edit}
            </Button>
            <Button
              type="link"
              size="small"
              danger
              icon={<DeleteOutlined />}
              disabled={Boolean(loadingCode)}
              onClick={() => handleDelete(record)}
            >
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
          <Space wrap>
            <Input.Search
              value={keywordInput}
              allowClear
              enterButton="查询"
              placeholder={ALARM_TEXT.recipientGroupSearch}
              style={{ width: 260 }}
              onChange={(event) => {
                const nextKeyword = event.target.value;
                setKeywordInput(nextKeyword);
                if (!nextKeyword) {
                  setKeyword('');
                  setParams((current) => ({ ...current, pageNum: 1 }));
                }
              }}
              onSearch={(value) => {
                setKeyword(value.trim());
                setParams((current) => ({ ...current, pageNum: 1 }));
              }}
            />
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void fetchData()}>
              {ALARM_TEXT.refresh}
            </Button>
            {hasFilters && <Button onClick={clearFilters}>{ALARM_TEXT.clearFilters}</Button>}
          </Space>
        </Card>

        <Card style={{ borderRadius: 12 }}>
          {loadError ? (
            <Alert
              type="error"
              showIcon
              message={ALARM_TEXT.loadRecipientGroupError}
              description={loadError}
              action={
                <Button size="small" onClick={() => void fetchData()}>
                  {ALARM_TEXT.retry}
                </Button>
              }
              style={{ marginBottom: 16 }}
            />
          ) : null}
          <Table
            rowKey="code"
            columns={columns}
            dataSource={data}
            loading={loading}
            locale={{
              emptyText: loadError ? null : (
                <ListEmpty
                  hasFilters={hasFilters}
                  emptyText={ALARM_TEXT.recipientGroupEmpty}
                  filteredText={ALARM_TEXT.recipientGroupEmptyFiltered}
                  onClearFilters={clearFilters}
                />
              ),
            }}
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
        onClose={requestCloseDrawer}
        width={720}
        destroyOnClose
        closable={!submitting}
        maskClosable={!submitting}
        keyboard={!submitting}
        footer={
          <Space style={{ width: '100%', justifyContent: 'flex-end' }}>
            <Button onClick={closeDrawer} disabled={submitting}>
              {ALARM_TEXT.close}
            </Button>
            <Button type="primary" loading={submitting} disabled={submitting} onClick={() => form.submit()}>
              {editingCode ? ALARM_TEXT.save : ALARM_TEXT.createRecipientGroup}
            </Button>
          </Space>
        }
      >
        <Form
          form={form}
          layout="vertical"
          onFinish={handleSubmit}
          onValuesChange={() => setDirty((previous) => (previous ? previous : true))}
        >
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
          <Form.Item
            name="memberUsernames"
            label={ALARM_TEXT.recipientGroupMembers}
            extra={ALARM_TEXT.recipientGroupMembersHint}
          >
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
          {userLoadError ? (
            <Alert
              type="warning"
              showIcon
              message={ALARM_TEXT.loadRecipientUsersError}
              description={userLoadError}
              action={
                <Button size="small" onClick={() => void loadUsers()}>
                  {ALARM_TEXT.retry}
                </Button>
              }
              style={{ marginTop: -8, marginBottom: 16 }}
            />
          ) : null}
        </Form>
      </Drawer>
    </div>
  );
};

export default AlarmRecipientGroupPage;
