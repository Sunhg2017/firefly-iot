import { useState } from 'react';
import {
  Button, Space, Tag, Typography,
  Modal, Form, Input, Select, InputNumber, Tooltip, Popconfirm,
  Card, Divider, message,
} from 'antd';
import {
  PlusOutlined, DeleteOutlined, EditOutlined,
} from '@ant-design/icons';
import { useSimStore, DataTemplate, TemplateField } from '../store';

const { Text } = Typography;

const valueTypeOptions = [
  { label: '随机整数', value: 'random_int' },
  { label: '随机浮点', value: 'random_float' },
  { label: '固定值', value: 'fixed' },
  { label: '时间戳', value: 'timestamp' },
  { label: '枚举', value: 'enum' },
];

export default function TemplateEditorPanel() {
  const { templates, addTemplate, removeTemplate } = useSimStore();
  const [open, setOpen] = useState(false);
  const [editTpl, setEditTpl] = useState<DataTemplate | null>(null);
  const [form] = Form.useForm();

  const openNew = () => {
    setEditTpl(null);
    form.setFieldsValue({
      name: '',
      type: 'property',
      fields: [{ key: '', valueType: 'random_float', min: 0, max: 100, decimals: 2 }],
    });
    setOpen(true);
  };

  const openEdit = (tpl: DataTemplate) => {
    setEditTpl(tpl);
    form.setFieldsValue({
      name: tpl.name,
      type: tpl.type,
      fields: tpl.fields.map((f) => ({
        key: f.key,
        valueType: f.valueType,
        min: f.min,
        max: f.max,
        decimals: f.decimals,
        fixed: f.fixed,
        enumValues: f.enumValues?.join(',') || '',
      })),
    });
    setOpen(true);
  };

  const handleSave = () => {
    form.validateFields().then((values) => {
      const fields: TemplateField[] = values.fields.map((f: any) => {
        const field: TemplateField = { key: f.key, valueType: f.valueType };
        if (f.valueType === 'random_int' || f.valueType === 'random_float') {
          field.min = f.min ?? 0;
          field.max = f.max ?? 100;
        }
        if (f.valueType === 'random_float') field.decimals = f.decimals ?? 2;
        if (f.valueType === 'fixed') field.fixed = f.fixed || '';
        if (f.valueType === 'enum') field.enumValues = (f.enumValues || '').split(',').map((s: string) => s.trim()).filter(Boolean);
        return field;
      });

      if (editTpl) {
        // Update: remove old, add new with same id
        removeTemplate(editTpl.id);
        addTemplate({ id: editTpl.id, name: values.name, type: values.type, fields });
        message.success(`模板 "${values.name}" 已更新`);
      } else {
        addTemplate({ id: `tpl-custom-${Date.now()}`, name: values.name, type: values.type, fields });
        message.success(`模板 "${values.name}" 已创建`);
      }
      setOpen(false);
    });
  };

  return (
    <>
      <Tooltip title="数据模板管理">
        <Button size="small" icon={<EditOutlined />} onClick={() => setOpen(true)} style={{ marginBottom: 8, marginLeft: 4 }} />
      </Tooltip>
      <Modal
        title={<Space><EditOutlined />{editTpl ? '编辑模板' : '数据模板管理'}</Space>}
        open={open}
        onCancel={() => setOpen(false)}
        footer={null}
        width={640}
      >
        {!editTpl && !form.getFieldValue('name') ? (
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text strong>模板列表</Text>
              <Button type="primary" size="small" icon={<PlusOutlined />} onClick={openNew}>新建模板</Button>
            </div>
            {templates.map((tpl) => (
              <Card key={tpl.id} size="small" style={{ marginBottom: 4 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Space>
                    <Text strong>{tpl.name}</Text>
                    <Tag color={tpl.type === 'property' ? 'blue' : tpl.type === 'event' ? 'orange' : 'green'}>{tpl.type}</Tag>
                    <Text type="secondary" style={{ fontSize: 11 }}>{tpl.fields.map((f) => f.key).join(', ')}</Text>
                  </Space>
                  <Space size={4}>
                    <Button size="small" type="link" icon={<EditOutlined />} onClick={() => openEdit(tpl)}>编辑</Button>
                    {tpl.id.startsWith('tpl-custom') && (
                      <Popconfirm title="确定删除？" onConfirm={() => { removeTemplate(tpl.id); message.success('已删除'); }}>
                        <Button size="small" type="link" danger icon={<DeleteOutlined />}>删除</Button>
                      </Popconfirm>
                    )}
                  </Space>
                </div>
              </Card>
            ))}
          </Space>
        ) : (
          <Form form={form} layout="vertical" size="small">
            <Space style={{ width: '100%' }} size={12}>
              <Form.Item name="name" label="模板名称" rules={[{ required: true, message: '请输入名称' }]} style={{ flex: 1 }}>
                <Input placeholder="如：温湿度传感器" />
              </Form.Item>
              <Form.Item name="type" label="类型" rules={[{ required: true }]}>
                <Select style={{ width: 120 }} options={[
                  { label: '属性', value: 'property' },
                  { label: '事件', value: 'event' },
                  { label: 'OTA', value: 'ota' },
                ]} />
              </Form.Item>
            </Space>
            <Divider style={{ margin: '8px 0' }} />
            <Text strong style={{ fontSize: 13 }}>字段列表</Text>
            <Form.List name="fields">
              {(fieldsList, { add, remove }) => (
                <div style={{ marginTop: 8 }}>
                  {fieldsList.map(({ key, name }) => (
                    <Card key={key} size="small" style={{ marginBottom: 8, background: 'rgba(255,255,255,0.02)' }}>
                      <Space wrap size={8} style={{ width: '100%' }}>
                        <Form.Item name={[name, 'key']} rules={[{ required: true, message: '键名' }]} style={{ margin: 0 }}>
                          <Input placeholder="字段键名" style={{ width: 120 }} />
                        </Form.Item>
                        <Form.Item name={[name, 'valueType']} rules={[{ required: true }]} style={{ margin: 0 }}>
                          <Select style={{ width: 120 }} options={valueTypeOptions} />
                        </Form.Item>
                        <Form.Item noStyle shouldUpdate={(prev, cur) => prev.fields?.[name]?.valueType !== cur.fields?.[name]?.valueType}>
                          {() => {
                            const vt = form.getFieldValue(['fields', name, 'valueType']);
                            if (vt === 'random_int' || vt === 'random_float') {
                              return (
                                <Space size={4}>
                                  <Form.Item name={[name, 'min']} style={{ margin: 0 }}><InputNumber placeholder="最小" style={{ width: 70 }} /></Form.Item>
                                  <Form.Item name={[name, 'max']} style={{ margin: 0 }}><InputNumber placeholder="最大" style={{ width: 70 }} /></Form.Item>
                                  {vt === 'random_float' && (
                                    <Form.Item name={[name, 'decimals']} style={{ margin: 0 }}><InputNumber placeholder="小数" min={0} max={6} style={{ width: 60 }} /></Form.Item>
                                  )}
                                </Space>
                              );
                            }
                            if (vt === 'fixed') return <Form.Item name={[name, 'fixed']} style={{ margin: 0 }}><Input placeholder="固定值" style={{ width: 120 }} /></Form.Item>;
                            if (vt === 'enum') return <Form.Item name={[name, 'enumValues']} style={{ margin: 0 }}><Input placeholder="逗号分隔枚举值" style={{ width: 200 }} /></Form.Item>;
                            return null;
                          }}
                        </Form.Item>
                        <Button type="link" danger icon={<DeleteOutlined />} onClick={() => remove(name)} disabled={fieldsList.length <= 1} />
                      </Space>
                    </Card>
                  ))}
                  <Button type="dashed" block icon={<PlusOutlined />} onClick={() => add({ key: '', valueType: 'random_float', min: 0, max: 100, decimals: 2 })}>
                    添加字段
                  </Button>
                </div>
              )}
            </Form.List>
            <Divider style={{ margin: '12px 0' }} />
            <Space>
              <Button type="primary" onClick={handleSave}>{editTpl ? '保存修改' : '创建模板'}</Button>
              <Button onClick={() => { setEditTpl(null); form.resetFields(); }}>
                {editTpl ? '返回列表' : '取消'}
              </Button>
            </Space>
          </Form>
        )}
      </Modal>
    </>
  );
}
