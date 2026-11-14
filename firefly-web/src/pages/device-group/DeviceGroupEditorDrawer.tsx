import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Button, Card, Drawer, Form, Input, Radio, Select, Space, Steps, Typography, message } from 'antd';
import CodeEditorField from '../../components/CodeEditorField';
import { useConfirmDiscard, useDirtyGuard } from '../../hooks/useDirtyGuard';
import { productApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
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
  tags: TagOptionRecord[];
  defaultParentId?: number;
  submitting?: boolean;
  onClose: () => void;
  onSubmit: (values: GroupFormValues) => void | Promise<void>;
}

/** Fields validated before leaving each step so required values cannot be skipped on the preview step. */
const STEP_FIELDS: Record<number, string[]> = {
  0: ['name', 'type', 'parentId', 'description'],
  1: ['matchMode', 'conditions'],
  2: [],
};

const DeviceGroupEditorDrawer: React.FC<Props> = ({ open, editingRecord, parentOptions, tags, defaultParentId, submitting, onClose, onSubmit }) => {
  const [form] = Form.useForm<GroupFormValues>();
  const [stepIndex, setStepIndex] = useState(0);
  const [maxStepIndex, setMaxStepIndex] = useState(0);
  const [dirty, setDirty] = useState(false);
  const ignoreDirtyRef = useRef(false);
  const confirmDiscard = useConfirmDiscard();
  const currentType = Form.useWatch('type', form) as GroupType | undefined;
  const watchedMatchMode = Form.useWatch('matchMode', form) as GroupFormValues['matchMode'];
  const watchedConditions = Form.useWatch('conditions', form) as GroupFormValues['conditions'];
  // 动态条件的产品候选按 keyword 远程搜索；已选 productKey 对应名称保存在缓存中，避免回显成裸 productKey。
  const [productRecordMap, setProductRecordMap] = useState<Record<string, ProductOptionRecord>>({});
  const [productSearching, setProductSearching] = useState(false);
  const [productSearchKeyword, setProductSearchKeyword] = useState('');
  const productSearchTimerRef = useRef<number | null>(null);
  const productSearchRequestRef = useRef(0);
  const selectedProductRequestRef = useRef<Set<string>>(new Set());

  const mergeProducts = (records: ProductOptionRecord[]) => {
    const valid = records.filter((item) => Boolean(item.productKey));
    if (valid.length === 0) {
      return;
    }
    setProductRecordMap((current) => {
      const next = { ...current };
      valid.forEach((item) => {
        next[item.productKey] = item;
      });
      return next;
    });
  };

  const searchProducts = async (keyword: string) => {
    const requestId = productSearchRequestRef.current + 1;
    productSearchRequestRef.current = requestId;
    setProductSearching(true);
    setProductSearchKeyword(keyword);
    try {
      const res = await productApi.list({ pageNum: 1, pageSize: 20, keyword: keyword.trim() || undefined });
      const records = (res.data.data?.records ?? []) as ProductOptionRecord[];
      if (requestId === productSearchRequestRef.current) {
        mergeProducts(records);
      }
    } catch (error) {
      // 搜索失败保留已选产品名称，由 message 明确提示。
      if (requestId === productSearchRequestRef.current) {
        message.error(getErrorMessage(error, '搜索产品失败'));
      }
    } finally {
      if (requestId === productSearchRequestRef.current) {
        setProductSearching(false);
      }
    }
  };

  const handleProductSearch = (keyword: string) => {
    if (productSearchTimerRef.current) {
      window.clearTimeout(productSearchTimerRef.current);
    }
    productSearchTimerRef.current = window.setTimeout(() => {
      void searchProducts(keyword);
    }, 300);
  };

  const productSelectOptions = useMemo(
    () => Object.values(productRecordMap).map((item) => ({
      value: item.productKey,
      label: `${item.name} (${item.productKey})`,
    })),
    [productRecordMap],
  );

  const productOptionMap = useMemo(
    () => new Map(Object.entries(productRecordMap)),
    [productRecordMap],
  );
  const tagOptionMap = useMemo(() => new Map(tags.map((item) => [normalizeTagSelector(item), item])), [tags]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    void searchProducts('');
    return () => {
      if (productSearchTimerRef.current) {
        window.clearTimeout(productSearchTimerRef.current);
      }
    };
    // 抽屉每次打开只取最近 20 个产品，后续由关键字搜索补全。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (!open) {
      return undefined;
    }
    const keys = new Set<string>();
    (watchedConditions || []).forEach((condition) => {
      if (condition.field === 'productKey' && Array.isArray(condition.values)) {
        condition.values.forEach((value) => {
          if (typeof value === 'string' && value) {
            keys.add(value);
          }
        });
      }
    });
    const missing = Array.from(keys)
      .filter((key) => !productRecordMap[key] && !selectedProductRequestRef.current.has(key));
    if (missing.length === 0) {
      return undefined;
    }
    missing.forEach((key) => selectedProductRequestRef.current.add(key));
    let active = true;
    void Promise.all(missing.map(async (key) => {
      try {
        const res = await productApi.list({ pageNum: 1, pageSize: 20, keyword: key });
        const records = (res.data.data?.records ?? []) as ProductOptionRecord[];
        return records.find((item) => item.productKey === key) ?? null;
      } catch {
        selectedProductRequestRef.current.delete(key);
        return null;
      }
    })).then((records) => {
      if (active) {
        mergeProducts(records.filter((item): item is ProductOptionRecord => item !== null));
      }
    });
    return () => {
      active = false;
    };
  }, [open, productRecordMap, watchedConditions]);

  useEffect(() => {
    if (!open) {
      setDirty(false);
      return undefined;
    }
    // Programmatic backfill must not be treated as unsaved user input.
    ignoreDirtyRef.current = true;
    form.resetFields();
    const parsedRule = parseDynamicRule(editingRecord?.dynamicRule);
    form.setFieldsValue({
      name: editingRecord?.name,
      description: editingRecord?.description,
      type: editingRecord?.type || 'STATIC',
      parentId: editingRecord?.parentId ?? defaultParentId ?? 0,
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
    setDirty(false);
    const timer = window.setTimeout(() => {
      ignoreDirtyRef.current = false;
    }, 0);
    return () => window.clearTimeout(timer);
  }, [defaultParentId, editingRecord, form, open]);

  useDirtyGuard(open && dirty);

  const requestClose = () => {
    confirmDiscard(dirty, () => {
      setDirty(false);
      form.resetFields();
      onClose();
    }, {
      title: '放弃未保存的分组修改？',
      content: '关闭后本次填写的基础信息和动态规则将丢失，且无法恢复。',
    });
  };

  const goNext = async () => {
    const fields = STEP_FIELDS[stepIndex] ?? [];
    if (fields.length > 0) {
      try {
        await form.validateFields(fields);
      } catch {
        message.error('请先补全当前步骤的必填项');
        return;
      }
    }
    const next = stepIndex + 1;
    setStepIndex(next);
    setMaxStepIndex((current) => Math.max(current, next));
  };

  const handleFinishFailed = ({ errorFields }: { errorFields: Array<{ name: Array<string | number> }> }) => {
    const rootField = errorFields[0]?.name?.[0];
    const targetStep = rootField === 'matchMode' || rootField === 'conditions' ? 1 : 0;
    setStepIndex(targetStep);
    setMaxStepIndex((current) => Math.max(current, targetStep));
    message.error('请先补全必填项后再保存分组');
  };

  const dynamicRulePreview = useMemo(() => currentType === 'DYNAMIC' ? JSON.stringify(buildDynamicRulePayload({ matchMode: watchedMatchMode || 'ALL', conditions: watchedConditions || [] }), null, 2) : '', [currentType, watchedConditions, watchedMatchMode]);

  return (
    <Drawer
      title={editingRecord ? '编辑设备分组' : '新建设备分组'}
      open={open}
      onClose={requestClose}
      destroyOnClose
      width={920}
      footer={
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <Button onClick={requestClose} disabled={submitting}>取消</Button>
          <Space>
            <Button disabled={stepIndex === 0 || submitting} onClick={() => setStepIndex((current) => Math.max(current - 1, 0))}>上一步</Button>
            {stepIndex >= DRAWER_STEPS.length - 1 ? (
              <Button type="primary" loading={submitting} onClick={() => form.submit()}>保存分组</Button>
            ) : (
              <Button type="primary" onClick={() => void goNext()}>下一步</Button>
            )}
          </Space>
        </div>
      }
    >
      <div style={{ marginBottom: 20 }}>
        <Steps current={stepIndex} responsive items={DRAWER_STEPS} onChange={(target) => { if (target <= maxStepIndex) setStepIndex(target); }} />
      </div>
      <Form
        form={form}
        layout="vertical"
        onFinish={onSubmit}
        onFinishFailed={handleFinishFailed}
        onValuesChange={() => { if (!ignoreDirtyRef.current) setDirty(true); }}
        initialValues={{ type: 'STATIC', parentId: 0, matchMode: 'ALL', conditions: [createEmptyCondition()] }}
      >
        {/* All steps stay mounted: hidden steps keep their rules registered, so submitting from the preview step still validates every required field. */}
        <div style={{ display: stepIndex === 0 ? 'block' : 'none' }}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Form.Item name="name" label="分组名称" rules={[{ required: true, message: '请输入分组名称' }]}><Input maxLength={64} placeholder="例如：华东仓储 / 在线网关" /></Form.Item>
            <Form.Item name="type" label="分组类型" rules={[{ required: true, message: '请选择分组类型' }]}><Radio.Group optionType="button" buttonStyle="solid" options={[{ label: '静态分组', value: 'STATIC' }, { label: '动态分组', value: 'DYNAMIC' }]} /></Form.Item>
            <Form.Item name="parentId" label="上级分组"><Select showSearch optionFilterProp="label" options={parentOptions} placeholder="不选择则为顶级分组" /></Form.Item>
            <Form.Item name="description" label="分组描述"><TextArea rows={4} maxLength={256} placeholder="选填，补充分组用途和维护范围" /></Form.Item>
          </Space>
        </div>

        <div style={{ display: stepIndex === 1 ? 'block' : 'none' }}>
          {currentType === 'DYNAMIC' ? <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Form.Item name="matchMode" label="触发方式" rules={[{ required: true, message: '请选择触发方式' }]}><Radio.Group optionType="button" buttonStyle="solid" options={[{ label: '全部条件满足', value: 'ALL' }, { label: '满足任意条件', value: 'ANY' }]} /></Form.Item>
            <Form.List name="conditions">{(fields, { add, remove }) => <Space direction="vertical" style={{ width: '100%' }} size={12}>{fields.map((field) => {
              const fieldName = (form.getFieldValue(['conditions', field.name, 'field']) || 'productKey') as string;
              return <Card key={field.key} size="small" title={`条件 ${field.name + 1}`} extra={fields.length > 1 ? <Button type="text" danger onClick={() => remove(field.name)}>删除</Button> : null}>
                <Space direction="vertical" style={{ width: '100%' }} size={12}>
                  <Form.Item name={[field.name, 'field']} label="条件字段" rules={[{ required: true, message: '请选择条件字段' }]}><Select options={FIELD_OPTIONS} /></Form.Item>
                  {fieldName === 'productKey' ? <Form.Item name={[field.name, 'values']} label="匹配产品" rules={[{ required: true, message: '请选择产品' }]}><Select mode="multiple" allowClear showSearch filterOption={false} onSearch={handleProductSearch} loading={productSearching} options={productSelectOptions} placeholder="搜索并选择产品（名称或 productKey）" notFoundContent={productSearching ? '搜索中...' : (productSearchKeyword ? '未找到匹配产品，换个关键字试试' : '输入关键字搜索产品')} /></Form.Item> : null}
                  {(fieldName === 'deviceName' || fieldName === 'nickname') ? <><Form.Item name={[field.name, 'operator']} label="匹配方式" rules={[{ required: true, message: '请选择匹配方式' }]}><Select options={TEXT_OPERATOR_OPTIONS} /></Form.Item><Form.Item name={[field.name, 'value']} label="匹配内容" rules={[{ required: true, message: '请输入匹配内容' }]}><Input placeholder="输入要匹配的文本" /></Form.Item></> : null}
                  {fieldName === 'status' ? <Form.Item name={[field.name, 'value']} label="设备状态" rules={[{ required: true, message: '请选择设备状态' }]}><Select options={STATUS_OPTIONS} /></Form.Item> : null}
                  {fieldName === 'onlineStatus' ? <Form.Item name={[field.name, 'value']} label="在线状态" rules={[{ required: true, message: '请选择在线状态' }]}><Select options={ONLINE_STATUS_OPTIONS} /></Form.Item> : null}
                  {fieldName === 'tag' ? <Form.Item name={[field.name, 'tagSelector']} label="设备标签" rules={[{ required: true, message: '请选择设备标签' }]}><Select showSearch optionFilterProp="label" options={tags.map((item) => ({ value: normalizeTagSelector(item), label: `${item.tagKey}: ${item.tagValue}` }))} /></Form.Item> : null}
                </Space>
              </Card>;
            })}<Button type="dashed" onClick={() => add(createEmptyCondition())}>新增条件</Button></Space>}</Form.List>
            <Card size="small" title="规则预览"><CodeEditorField language="json" path="device-group-rule-preview.json" value={dynamicRulePreview} readOnly height={220} readOnlyLabel="自动生成" /></Card>
          </Space> : <Card><Typography.Text type="secondary">静态分组不需要配置动态规则，保存后可手动维护成员设备。</Typography.Text></Card>}
        </div>

        <div style={{ display: stepIndex === 2 ? 'block' : 'none' }}>
          <Space direction="vertical" style={{ width: '100%' }} size={16}>
            <Card size="small" title="基础信息"><Space direction="vertical" size={8}><Typography.Text>名称：{form.getFieldValue('name') || '-'}</Typography.Text><Typography.Text>类型：{getGroupTypeMeta(currentType).label}</Typography.Text><Typography.Text>说明：{form.getFieldValue('description') || '暂无描述'}</Typography.Text></Space></Card>
            {currentType === 'DYNAMIC' ? <><Card size="small" title="规则摘要"><Space direction="vertical" style={{ width: '100%' }} size={8}><Typography.Text>触发方式：{(watchedMatchMode || 'ALL') === 'ALL' ? '全部条件满足' : '满足任意条件'}</Typography.Text>{(watchedConditions || []).map((condition, index) => <Typography.Text key={`${condition.field || 'condition'}-${index}`}>条件 {index + 1}：{describeCondition(condition, productOptionMap, tagOptionMap)}</Typography.Text>)}</Space></Card><Card size="small" title="规则 JSON"><CodeEditorField language="json" path="device-group-rule-confirm.json" value={dynamicRulePreview} readOnly height={220} readOnlyLabel="提交内容" /></Card></> : <Card size="small"><Typography.Text type="secondary">静态分组保存后即可在当前页面手动管理成员。</Typography.Text></Card>}
          </Space>
        </div>
      </Form>
    </Drawer>
  );
};

export default DeviceGroupEditorDrawer;
