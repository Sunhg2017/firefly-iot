import React, { useEffect, useRef, useState } from 'react';
import {
  Button,
  Card,
  Drawer,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Switch,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import { PlusOutlined, EditOutlined, DeleteOutlined, ReloadOutlined, UnorderedListOutlined } from '@ant-design/icons';
import { dictApi } from '../../services/api';
import type { ColumnsType } from 'antd/es/table';
import PageHeader from '../../components/PageHeader';
import ListEmpty from '../../components/ListEmpty';
import { usePageActivation } from '../../hooks/usePageActivation';
import { getErrorMessage } from '../../utils/errors';
import { formatDateTime } from '../../utils/datetime';

interface DictTypeItem {
  id: number; code: string; name: string; systemFlag: boolean; enabled: boolean; description: string; createdAt: string;
}
interface DictItemRecord {
  id: number; dictTypeId: number; itemValue: string; itemLabel: string; itemLabel2: string;
  sortOrder: number; enabled: boolean; cssClass: string; description: string;
}

interface DictQuery {
  pageNum: number;
  pageSize: number;
  keyword?: string;
}

type DeleteTarget =
  | { kind: 'type'; record: DictTypeItem }
  | { kind: 'item'; record: DictItemRecord };

const DictPage: React.FC = () => {
  const [types, setTypes] = useState<DictTypeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [query, setQuery] = useState<DictQuery>({ pageNum: 1, pageSize: 20 });
  const [searchText, setSearchText] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [typeOpen, setTypeOpen] = useState(false);
  const [editType, setEditType] = useState<DictTypeItem | null>(null);
  const [typeSaving, setTypeSaving] = useState(false);
  const [typeForm] = Form.useForm();

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [currentType, setCurrentType] = useState<DictTypeItem | null>(null);
  const [items, setItems] = useState<DictItemRecord[]>([]);
  const [itemLoading, setItemLoading] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [editItem, setEditItem] = useState<DictItemRecord | null>(null);
  const [itemSaving, setItemSaving] = useState(false);
  const [itemForm] = Form.useForm();
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

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

  const listRequestIdRef = useRef(0);

  const fetchTypes = async (nextQuery: DictQuery) => {
    const requestId = listRequestIdRef.current + 1;
    listRequestIdRef.current = requestId;
    setLoading(true);
    try {
      const request: Record<string, unknown> = {
        pageNum: nextQuery.pageNum,
        pageSize: nextQuery.pageSize,
      };
      if (nextQuery.keyword) {
        request.keyword = nextQuery.keyword;
      }
      const res = await dictApi.listTypes(request);
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      const page = res.data.data;
      setTypes(page.records || []);
      setTotal(page.total || 0);
    } catch (error) {
      if (requestId !== listRequestIdRef.current) {
        return;
      }
      message.error(getErrorMessage(error, '加载字典类型失败'));
    } finally {
      if (requestId === listRequestIdRef.current) {
        setLoading(false);
      }
    }
  };

  // 查询条件统一放进 query state，由 effect 驱动请求：搜索第一次点击就会带上最新关键字，
  // 也不会再出现 setState 后手动 fetch 造成的重复请求。
  useEffect(() => {
    void fetchTypes(query);
  }, [query, reloadToken]);

  const fetchItems = async (typeId: number) => {
    setItemLoading(true);
    try {
      const res = await dictApi.listItems(typeId);
      setItems(res.data.data || []);
    } catch (error) {
      message.error(getErrorMessage(error, '加载字典项失败'));
    } finally {
      setItemLoading(false);
    }
  };

  const handleSearch = (value: string) => {
    setSearchText(value);
    setQuery((previous) => ({
      ...previous,
      pageNum: 1,
      keyword: value.trim() || undefined,
    }));
  };

  const handleResetSearch = () => {
    setSearchText('');
    setQuery((previous) => ({ pageNum: 1, pageSize: previous.pageSize }));
  };

  const handleEditType = (record: DictTypeItem | null) => {
    setEditType(record);
    setTypeOpen(true);
  };

  useEffect(() => {
    if (!typeOpen) {
      return;
    }
    typeForm.resetFields();
    if (editType) {
      typeForm.setFieldsValue(editType);
    } else {
      typeForm.setFieldsValue({ enabled: true });
    }
  }, [editType, typeForm, typeOpen]);

  const handleSaveType = async (values: Record<string, unknown>) => {
    setTypeSaving(true);
    try {
      if (editType) {
        await dictApi.updateType(editType.id, values);
        message.success('字典类型已更新');
      } else {
        await dictApi.createType(values);
        message.success('字典类型已创建');
      }
      setTypeOpen(false);
      setQuery((previous) => ({ ...previous, pageNum: 1 }));
      setReloadToken((current) => current + 1);
    } catch (error) {
      message.error(getErrorMessage(error, '保存字典类型失败'));
    } finally {
      setTypeSaving(false);
    }
  };

  const openItems = (record: DictTypeItem) => {
    setCurrentType(record);
    setDrawerOpen(true);
    void fetchItems(record.id);
  };

  const handleEditItem = (record: DictItemRecord | null) => {
    setEditItem(record);
    setItemOpen(true);
  };

  useEffect(() => {
    if (!itemOpen) {
      return;
    }
    itemForm.resetFields();
    if (editItem) {
      itemForm.setFieldsValue(editItem);
    } else {
      itemForm.setFieldsValue({ sortOrder: 0, enabled: true });
    }
  }, [editItem, itemForm, itemOpen]);

  const handleSaveItem = async (values: Record<string, unknown>) => {
    if (!currentType) {
      message.error('请先选择字典类型');
      return;
    }
    setItemSaving(true);
    try {
      if (editItem) {
        await dictApi.updateItem(editItem.id, values);
        message.success('字典项已更新');
      } else {
        await dictApi.createItem(currentType.id, values);
        message.success('字典项已创建');
      }
      setItemOpen(false);
      await fetchItems(currentType.id);
    } catch (error) {
      message.error(getErrorMessage(error, '保存字典项失败'));
    } finally {
      setItemSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) {
      return;
    }
    setDeleteSubmitting(true);
    try {
      if (deleteTarget.kind === 'type') {
        await dictApi.deleteType(deleteTarget.record.id);
        message.success('字典类型已删除');
        setDeleteTarget(null);
        setQuery((previous) => ({ ...previous, pageNum: 1 }));
        setReloadToken((current) => current + 1);
      } else {
        await dictApi.deleteItem(deleteTarget.record.id);
        message.success('字典项已删除');
        setDeleteTarget(null);
        if (currentType) {
          await fetchItems(currentType.id);
        }
      }
    } catch (error) {
      message.error(getErrorMessage(error, deleteTarget.kind === 'type' ? '删除字典类型失败' : '删除字典项失败'));
    } finally {
      setDeleteSubmitting(false);
    }
  };

  const closeTypeModal = () => {
    if (typeSaving) {
      return;
    }
    if (typeForm.isFieldsTouched()) {
      Modal.confirm({
        title: '放弃未保存的修改？',
        content: '关闭后本次填写的字典信息将丢失，且无法恢复。',
        okText: '放弃修改',
        cancelText: '继续编辑',
        okButtonProps: { danger: true },
        onOk: () => setTypeOpen(false),
      });
      return;
    }
    setTypeOpen(false);
  };

  const closeItemModal = () => {
    if (itemSaving) {
      return;
    }
    if (itemForm.isFieldsTouched()) {
      Modal.confirm({
        title: '放弃未保存的修改？',
        content: '关闭后本次填写的字典项将丢失，且无法恢复。',
        okText: '放弃修改',
        cancelText: '继续编辑',
        okButtonProps: { danger: true },
        onOk: () => setItemOpen(false),
      });
      return;
    }
    setItemOpen(false);
  };

  const typeColumns: ColumnsType<DictTypeItem> = [
    { title: '字典编码', dataIndex: 'code', width: 180 },
    { title: '字典名称', dataIndex: 'name', width: 180 },
    { title: '系统', dataIndex: 'systemFlag', width: 70, render: (v: boolean) => v ? <Tag color="red">系统</Tag> : <Tag>自定义</Tag> },
    { title: '状态', dataIndex: 'enabled', width: 70, render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '启用' : '禁用'}</Tag> },
    { title: '描述', dataIndex: 'description', ellipsis: true, render: (v: string) => v || '-' },
    { title: '创建时间', dataIndex: 'createdAt', width: 180, render: (value: string) => (value ? formatDateTime(value) : '-') },
    {
      title: '操作', width: 250, fixed: 'right',
      render: (_: unknown, record: DictTypeItem) => (
        <Space size="small">
          <Button type="link" size="small" icon={<UnorderedListOutlined />} onClick={() => openItems(record)}>字典项</Button>
          <Tooltip title={record.systemFlag ? '系统内置字典，不可编辑' : undefined}>
            <span>
              <Button
                type="link"
                size="small"
                icon={<EditOutlined />}
                onClick={() => handleEditType(record)}
                disabled={record.systemFlag}
              >
                编辑
              </Button>
            </span>
          </Tooltip>
          <Tooltip title={record.systemFlag ? '系统内置字典，不可删除' : undefined}>
            <span>
              <Button
                type="link"
                size="small"
                danger
                icon={<DeleteOutlined />}
                disabled={record.systemFlag}
                onClick={() => setDeleteTarget({ kind: 'type', record })}
              >
                删除
              </Button>
            </span>
          </Tooltip>
        </Space>
      ),
    },
  ];

  const itemColumns: ColumnsType<DictItemRecord> = [
    { title: '值', dataIndex: 'itemValue', width: 120 },
    { title: '标签', dataIndex: 'itemLabel', width: 140 },
    { title: '备用标签', dataIndex: 'itemLabel2', width: 120, render: (v: string) => v || '-' },
    { title: '排序', dataIndex: 'sortOrder', width: 70 },
    { title: '状态', dataIndex: 'enabled', width: 70, render: (v: boolean) => <Tag color={v ? 'success' : 'default'}>{v ? '启' : '禁'}</Tag> },
    { title: '样式', dataIndex: 'cssClass', width: 110, render: (v: string) => v || '-' },
    {
      title: '操作', width: 150,
      render: (_: unknown, record: DictItemRecord) => (
        <Space size="small">
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditItem(record)}>编辑</Button>
          <Button
            type="link"
            size="small"
            danger
            icon={<DeleteOutlined />}
            onClick={() => setDeleteTarget({ kind: 'item', record })}
          >
            删除
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        title="数据字典"
        description={`共 ${total} 个字典类型`}
        extra={(
          <Space>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => setReloadToken((current) => current + 1)}>
              刷新
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => handleEditType(null)}>新建字典</Button>
          </Space>
        )}
      />

      <Card bodyStyle={{ padding: '12px 16px' }} style={{ borderRadius: 10, marginBottom: 16, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Space wrap>
          <Input.Search
            placeholder="搜索编码/名称"
            allowClear
            enterButton="查询"
            style={{ width: 260 }}
            value={searchText}
            onChange={(event) => {
              const value = event.target.value;
              setSearchText(value);
              if (!value) {
                // 清空输入框即恢复完整列表，不需要再点一次查询。
                setQuery((previous) => ({ pageNum: 1, pageSize: previous.pageSize }));
              }
            }}
            onSearch={handleSearch}
          />
          <Button onClick={handleResetSearch}>重置</Button>
        </Space>
      </Card>

      <Card style={{ borderRadius: 12, border: 'none', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
        <Table
          rowKey="id"
          columns={typeColumns}
          dataSource={types}
          loading={loading}
          size="small"
          scroll={{ x: 940 }}
          locale={{
            emptyText: (
              <ListEmpty
                hasFilters={Boolean(query.keyword)}
                emptyText="暂无字典类型，请先新建字典"
                filteredText="没有符合当前关键字的字典类型"
                onClearFilters={handleResetSearch}
              />
            ),
          }}
          pagination={{
            current: query.pageNum,
            pageSize: query.pageSize,
            total,
            showSizeChanger: true,
            showTotal: (t: number) => `共 ${t} 条`,
            onChange: (page: number, size: number) => setQuery((previous) => ({ ...previous, pageNum: page, pageSize: size })),
          }}
        />
      </Card>

      <Modal
        title={editType ? '编辑字典' : '新建字典'}
        open={typeOpen}
        onCancel={closeTypeModal}
        onOk={() => typeForm.submit()}
        confirmLoading={typeSaving}
        maskClosable={!typeSaving}
        destroyOnClose
        width={480}
      >
        <Form form={typeForm} layout="vertical" onFinish={handleSaveType}>
          <Form.Item name="code" label="字典编码" rules={[{ required: true, message: '请输入字典编码' }]}>
            <Input placeholder="如: device_status" disabled={!!editType} />
          </Form.Item>
          <Form.Item name="name" label="字典名称" rules={[{ required: true, message: '请输入字典名称' }]}><Input /></Form.Item>
          <Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="禁用" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={`字典项 - ${currentType?.name || ''} (${currentType?.code || ''})`}
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        width={760}
        extra={<Button type="primary" size="small" icon={<PlusOutlined />} onClick={() => handleEditItem(null)}>新增</Button>}
      >
        <Table
          rowKey="id"
          columns={itemColumns}
          dataSource={items}
          loading={itemLoading}
          size="small"
          pagination={false}
          locale={{ emptyText: <ListEmpty emptyText="该字典还没有字典项" /> }}
        />
      </Drawer>

      <Modal
        title={editItem ? '编辑字典项' : '新建字典项'}
        open={itemOpen}
        onCancel={closeItemModal}
        onOk={() => itemForm.submit()}
        confirmLoading={itemSaving}
        maskClosable={!itemSaving}
        destroyOnClose
        width={480}
      >
        <Form form={itemForm} layout="vertical" onFinish={handleSaveItem}>
          <Form.Item name="itemValue" label="值" rules={[{ required: true, message: '请输入字典项值' }]}><Input /></Form.Item>
          <Form.Item name="itemLabel" label="标签" rules={[{ required: true, message: '请输入字典项标签' }]}><Input /></Form.Item>
          <Form.Item name="itemLabel2" label="备用标签"><Input placeholder="如英文标签" /></Form.Item>
          <Space>
            <Form.Item name="sortOrder" label="排序"><InputNumber style={{ width: 100 }} min={0} precision={0} /></Form.Item>
            <Form.Item name="enabled" label="状态" valuePropName="checked"><Switch checkedChildren="启用" unCheckedChildren="禁用" /></Form.Item>
          </Space>
          <Form.Item name="cssClass" label="样式类名"><Input placeholder="前端 Tag/Badge 样式" /></Form.Item>
          <Form.Item name="description" label="描述"><Input.TextArea rows={2} /></Form.Item>
        </Form>
      </Modal>

      <Modal
        open={Boolean(deleteTarget)}
        title={deleteTarget?.kind === 'type' ? '删除字典类型' : '删除字典项'}
        okText="删除"
        cancelText="取消"
        okButtonProps={{ danger: true }}
        confirmLoading={deleteSubmitting}
        maskClosable={!deleteSubmitting}
        onCancel={() => {
          if (!deleteSubmitting) {
            setDeleteTarget(null);
          }
        }}
        onOk={() => void handleConfirmDelete()}
        destroyOnClose
      >
        {deleteTarget ? (
          <Space direction="vertical" size={8}>
            {deleteTarget.kind === 'type' ? (
              <>
                <Typography.Text>
                  确认删除字典类型 <Typography.Text strong>{deleteTarget.record.name}</Typography.Text>
                  （{deleteTarget.record.code}）？
                </Typography.Text>
                <Typography.Text>
                  删除后会同时删除该字典下的全部 {deleteTarget.record.systemFlag ? '系统' : ''}字典项，
                  使用该字典的页面将无法再读取到选项，且不可恢复。
                </Typography.Text>
              </>
            ) : (
              <>
                <Typography.Text>
                  确认删除字典项 <Typography.Text strong>{deleteTarget.record.itemLabel}</Typography.Text>
                  （值：{deleteTarget.record.itemValue}）？
                </Typography.Text>
                <Typography.Text>删除后使用该选项的历史数据仍会保留原值，但新表单将不再提供该选项，且不可恢复。</Typography.Text>
              </>
            )}
          </Space>
        ) : null}
      </Modal>
    </div>
  );
};

export default DictPage;
