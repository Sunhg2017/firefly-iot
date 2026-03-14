import React, { useEffect, useMemo, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Radio, Select, Space, Steps, Typography } from 'antd';
import CodeEditorField from '../../components/CodeEditorField';
import {
  buildDynamicRulePayload,
  createEmptyCondition,
  describeCondition,
  DRAWER_STEPS,
  FIELD_OPTIONS,
  type GroupFormValues,
  type GroupType,
  type ProductOptionRecord,
  type TagOptionRecord,
  getGroupTypeMeta,
  normalizeTagSelector,
  ONLINE_STATUS_OPTIONS,
  parseDynamicRule,
  STATUS_OPTIONS,
  TEXT_OPERATOR_OPTIONS,
} from './deviceGroupRuleUtils';

const { TextArea } = Input;

interface EditingGroupRecord { id: number; name: string; description?: string; type: GroupType; dynamicRule?: string | null; parentId: number | null; }
interface ParentOption { label: string; value: number; }

interface Props {
  open: boolean;
  editingRecord: EditingGroupRecord | null;
  parentOptions: ParentOption[];
  products: ProductOptionRecord[];
  tags: TagOptionRecord[];
  onClose: () => void;
  onSubmit: (values: GroupFormValues) => void;
}

const DeviceGroupEditorDrawer: React.FC<Props> = ({ open, editingRecord, parentOptions, products, tags, onClose, onSubmit }) => {
  const [form] = Form.useForm<GroupFormValues>();
  const [stepIndex, setStepIndex] = useState(0);
  const [maxStepIndex, setMaxStepIndex] = useState(0);
  const currentType = Form.useWatch('type', form) as GroupType | undefined;
  const watchedMatchMode = Form.useWatch('matchMode', form) as GroupFormValues['matchMode'];
  const watchedConditions = Form.useWatch('conditions', form) as GroupFormValues['conditions'];
  const productOptionMap = useMemo(() => new Map(products.map((item) => [item.productKey, item])), [products]);
  const tagOptionMap = useMemo(() => new Map(tags.map((item) => [normalizeTagSelector(item), item])), [tags]);

  useEffect(() => {
    if (!open) return;
    form.resetFields();
    const parsedRule = parseDynamicRule(editingRecord?.dynamicRule);
    form.setFieldsValue({
      name: editingRecord?.name,
      description: editingRecord?.description,
      type: editingRecord?.type || 'STATIC',
      parentId: editingRecord?.parentId ?? 0,
      matchMode: parsedRule?.matchMode || 'ALL',
      conditions: parsedRule?.conditions?.length ? parsedRule.conditions.map((condition) => {
        if (condition.field === 'productKey') return { field: 'productKey', operator: 'IN', values: Array.isArray(condition.values) ? condition.values as string[] : [] };
        if (condition.field === 'deviceName' || condition.field === 'nickname') return { field: condition.field as 'deviceName' | 'nickname', operator: `${condition.operator || 'CONTAINS'}`, value: `${condition.value || ''}` };
        if (condition.field === 'status' || condition.field === 'onlineStatus') return { field: condition.field as 'status' | 'onlineStatus', operator: 'EQ', value: `${condition.value || ''}` };
        return { field: 'tag', operator: 'HAS_TAG', tagSelector: JSON.stringify({ tagKey: condition.tagKey, tagValue: condition.tagValue }) };
      }) : [createEmptyCondition()],
    });
    setStepIndex(0);
    setMaxStepIndex(0);
  }, [editingRecord, form, open]);

  const dynamicRulePreview = useMemo(() => currentType === 'DYNAMIC' ? JSON.stringify(buildDynamicRulePayload({ matchMode: watchedMatchMode || 'ALL', conditions: watchedConditions || [] }), null, 2) : '', [currentType, watchedConditions, watchedMatchMode]);

  return (
    <Drawer
      title={editingRecord ? '编辑设备分组' : '新建设备分组'}
      open={open}
      onClose={onClose}
      destroyOnClose
      width={920}
      footer={<div style={{ display: 'flex', justifyContent: 'space-between' }}><Button onClick={onClose}>取消</Button><Space><Button disabled={stepIndex === 0} onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}>上一步</Button>{stepIndex >= DRAWER_STEPS.length - 1 ? <Button type="primary" onClick={() => form.submit()}>保存分组</Button> : <Button type="primary" onClick={() => { const next = stepIndex + 1; setStepIndex(next); setMaxStepIndex((current) => Math.max(current, next)); }}>下一步</Button>}</Space></div>}
    >
      <div style={{ marginBottom: 20 }}>
        <Steps current={stepIndex} responsive items={DRAWER_STEPS} onChange={(target) => { if (target <= maxStepIndex) setStepIndex(target); }} />
      </div>
      <Form form={form} layout="vertical" onFinish={onSubmit} initialValues={{ type: 'STATIC', parentId: 0, matchMode: 'ALL', conditions: [createEmptyCondition()] }}>
        {stepIndex === 0 ? <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}><Input maxLength={64} placeholder="例如：华东仓储 / 在线网关" /></Form.Item>
          <Form.Item name="type" label="分组类型" rules={[{ required: true, message: '请选择分组类型' }]}><Radio.Group optionType="button" buttonStyle="solid" options={[{ label: '静态分组', value: 'STATIC' }, { label: '动态分组', value: 'DYNAMIC' }]} /></Form.Item>
          <Form.Item name="parentId" label="上级分组"><Select options={parentOptions} placeholder="不选择则为顶级分组" /></Form.Item>
          <Form.Item name="description" label="分组描述"><TextArea rows={4} maxLength={256} placeholder="补充分组用途、业务范围和维护口径" /></Form.Item>
        </Space> : null}

        {stepIndex === 1 ? currentType === 'DYNAMIC' ? <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Form.Item name="matchMode" label="触发方式" rules={[{ required: true, message: '请选择触发方式' }]}><Radio.Group optionType="button" buttonStyle="solid" options={[{ label: '全部条件满足', value: 'ALL' }, { label: '满足任意条件', value: 'ANY' }]} /></Form.Item>
          <Form.List name="conditions">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: '100%' }} size={12}>{fields.map((field) => {
            const fieldName = (form.getFieldValue(['conditions', field.name, 'field']) || 'productKey') as string;
            return <Card key={field.key} size="small" title={`条件 ${field.name + 1}`} extra={fields.length > 1 ? <Button type="text" danger onClick={() => remove(field.name)}>删除</Button> : null}>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                <Form.Item name={[field.name, 'field']} label="条件字段" rules={[{ required: true, message: '请选择条件字段' }]}><Select options={FIELD_OPTIONS} /></Form.Item>
                {fieldName === 'productKey' ? <Form.Item name={[field.name, 'values']} label="匹配产品" rules={[{ required: true, message: '请选择产品' }]}><Select mode="multiple" allowClear optionFilterProp="label" options={products.map((item) => ({ value: item.productKey, label: `${item.name} (${item.productKey})` }))} /></Form.Item> : null}
                {(fieldName === 'deviceName' || fieldName === 'nickname') ? <><Form.Item name={[field.name, 'operator']} label="匹配方式" rules={[{ required: true, message: '请选择匹配方式' }]}><Select options={TEXT_OPERATOR_OPTIONS} /></Form.Item><Form.Item name={[field.name, 'value']} label="匹配内容" rules={[{ required: true, message: '请输入匹配内容' }]}><Input placeholder="输入要匹配的文本" /></Form.Item></> : null}
                {fieldName === 'status' ? <Form.Item name={[field.name, 'value']} label="设备状态" rules={[{ required: true, message: '请选择设备状态' }]}><Select options={STATUS_OPTIONS} /></Form.Item> : null}
                {fieldName === 'onlineStatus' ? <Form.Item name={[field.name, 'value']} label="在线状态" rules={[{ required: true, message: '请选择在线状态' }]}><Select options={ONLINE_STATUS_OPTIONS} /></Form.Item> : null}
                {fieldName === 'tag' ? <Form.Item name={[field.name, 'tagSelector']} label="设备标签" rules={[{ required: true, message: '请选择设备标签' }]}><Select showSearch optionFilterProp="label" options={tags.map((item) => ({ value: normalizeTagSelector(item), label: `${item.tagKey}: ${item.tagValue}` }))} /></Form.Item> : null}
              </Space>
            </Card>;
          })}<Button type="dashed" onClick={() => add(createEmptyCondition())}>新增条件</Button></Space>}</Form.List>
          <Card size="small" title="规则预览"><CodeEditorField language="json" path="device-group-rule-preview.json" value={dynamicRulePreview} readOnly height={220} readOnlyLabel="自动生成" /></Card>
        </Space> : <Card><Typography.Text type="secondary">静态分组不需要配置动态规则，保存后可手动维护成员设备。</Typography.Text></Card> : null}

        {stepIndex === 2 ? <Space direction="vertical" style={{ width: '100%' }} size={16}>
          <Card size="small" title="基础信息"><Space direction="vertical" size={8}><Typography.Text>名称：{form.getFieldValue('name') || '-'}</Typography.Text><Typography.Text>类型：{getGroupTypeMeta(currentType).label}</Typography.Text><Typography.Text>说明：{form.getFieldValue('description') || '暂无描述'}</Typography.Text></Space></Card>
          {currentType === 'DYNAMIC' ? <><Card size="small" title="规则摘要"><Space direction="vertical" style={{ width: '100%' }} size={8}><Typography.Text>触发方式：{(watchedMatchMode || 'ALL') === 'ALL' ? '全部条件满足' : '满足任意条件'}</Typography.Text>{(watchedConditions || []).map((condition, index) => <Typography.Text key={`${condition.field || 'condition'}-${index}`}>条件 {index + 1}：{describeCondition(condition, productOptionMap, tagOptionMap)}</Typography.Text>)}</Space></Card><Card size="small" title="规则 JSON"><CodeEditorField language="json" path="device-group-rule-confirm.json" value={dynamicRulePreview} readOnly height={220} readOnlyLabel="提交内容" /></Card></> : <Card size="small"><Typography.Text type="secondary">静态分组保存后即可在当前页面手动管理成员。</Typography.Text></Card>}
        </Space> : null}
      </Form>
    </Drawer>
  );
};

export default DeviceGroupEditorDrawer;
