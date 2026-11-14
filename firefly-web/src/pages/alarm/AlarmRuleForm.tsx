import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import {
  Alert,
  Button,
  Card,
  Col,
  Divider,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
  message,
} from 'antd';
import type { FormInstance } from 'antd/es/form';
import { ALARM_TEXT } from './alarmText';
import {
  AGGREGATE_OPTIONS,
  CHANGE_DIRECTION_OPTIONS,
  CHANGE_MODE_OPTIONS,
  COMPARE_TARGET_OPTIONS,
  CONDITION_TYPE_OPTIONS,
  DEFAULT_ALARM_CONDITION_ITEM,
  DEFAULT_ALARM_CONDITION_VALUES,
  DEFAULT_ALARM_RULE_GROUP,
  LEVEL_OPTIONS,
  OPERATOR_OPTIONS,
  TRIGGER_MODE_OPTIONS,
  WINDOW_UNIT_OPTIONS,
  deriveAlarmRuleLevel,
  describeAlarmConditionItem,
  describeAlarmConditionValues,
  getAlarmTriggerModeLabel,
  type AlarmConditionItemFormValues,
  type AlarmConditionType,
  type AlarmRuleGroupFormValues,
  type AlarmRuleLevel,
} from './alarmCondition';
import { describeAlarmNotifyConfig, type AlarmNotificationMethod } from './alarmNotify';
import { deviceApi, productApi, projectApi } from '../../services/api';
import { getErrorMessage } from '../../utils/errors';
import { useRemoteOptions, type RemoteOption } from '../../components/EntitySelect';

const { TextArea } = Input;

export interface AlarmScopeOption {
  value: number;
  label: string;
  projectId?: number;
  productId?: number;
}

interface ProjectScopeRecord {
  id: number;
  code?: string;
  name?: string;
}

interface ProductScopeRecord {
  id: number;
  name?: string;
  productKey?: string;
}

interface DeviceScopeRecord {
  id: number;
  deviceName?: string;
  nickname?: string;
}

interface RemoteScopeSelectProps<T> {
  value?: number;
  onChange?: (value?: number) => void;
  pinnedLabel?: string;
  placeholder?: string;
  disabled?: boolean;
  loader: (keyword: string) => Promise<T[]>;
  toOption: (item: T) => RemoteOption;
}

/**
 * 告警范围单选：按 keyword 走服务端搜索；父级变化时由调用方以 key 重新挂载，
 * 保证产品/设备候选始终按项目、productId 收敛。
 */
function RemoteScopeSelect<T>({ value, onChange, pinnedLabel, placeholder, disabled, loader, toOption }: RemoteScopeSelectProps<T>) {
  const { options, loading, onSearch } = useRemoteOptions(loader, toOption);
  const [labelCache, setLabelCache] = useState<Record<number, string>>({});

  useEffect(() => {
    if (options.length === 0) {
      return;
    }
    setLabelCache((current) => {
      const next = { ...current };
      options.forEach((item) => {
        next[item.value] = item.label;
      });
      return next;
    });
  }, [options]);

  useEffect(() => {
    if (value && pinnedLabel) {
      setLabelCache((current) => (current[value] === pinnedLabel ? current : { ...current, [value]: pinnedLabel }));
    }
  }, [pinnedLabel, value]);

  const mergedOptions = useMemo<RemoteOption[]>(() => {
    const known = new Set(options.map((item) => item.value));
    const missing = value != null && !known.has(value) ? [value] : [];
    return [
      ...options,
      ...missing.map((id) => ({ value: id, label: labelCache[id] ?? '已选项' })),
    ];
  }, [labelCache, options, value]);

  return (
    <Select
      allowClear
      showSearch
      filterOption={false}
      onSearch={onSearch}
      options={mergedOptions}
      loading={loading}
      value={value}
      disabled={disabled}
      onChange={(next) => onChange?.(next)}
      placeholder={placeholder}
      notFoundContent={loading ? '搜索中...' : '未找到匹配项，换个关键字试试'}
    />
  );
}

export interface AlarmMetricOption {
  value: string;
  label: string;
}

export interface AlarmNotificationMethodOption {
  value: AlarmNotificationMethod;
  label: string;
  channelCount?: number;
}

export interface AlarmRecipientGroupOption {
  value: string;
  label: string;
  memberCount?: number;
}

export interface AlarmRecipientUserOption {
  value: string;
  label: string;
}

export type AlarmRuleFormStep = 'basic' | 'scope' | 'groups' | 'notify' | 'preview';

interface Props {
  form: FormInstance;
  projectOptions: AlarmScopeOption[];
  productOptions: AlarmScopeOption[];
  deviceOptions: AlarmScopeOption[];
  metricOptions: AlarmMetricOption[];
  /** True while the thing-model properties are being loaded for the selected product. */
  metricLoading?: boolean;
  /** True once the thing-model request for the selected product has finished. */
  metricLoaded?: boolean;
  /** Set when the thing-model request failed; the form then offers a retry instead of "no properties". */
  metricError?: string;
  onRetryMetric?: () => void;
  metricLabelMap: Record<string, string>;
  notificationMethodOptions: AlarmNotificationMethodOption[];
  recipientGroupOptions: AlarmRecipientGroupOption[];
  recipientUserOptions: AlarmRecipientUserOption[];
  currentStep: AlarmRuleFormStep;
  showEnabled?: boolean;
}

interface ConditionEditorProps {
  form: FormInstance;
  groupIndex: number;
  conditionIndex: number;
  canRemove: boolean;
  metricOptions: AlarmMetricOption[];
  metricLoading?: boolean;
  metricLabelMap: Record<string, string>;
  onRemove: () => void;
}

interface RuleGroupEditorProps {
  form: FormInstance;
  groupIndex: number;
  canRemove: boolean;
  metricOptions: AlarmMetricOption[];
  metricLoading?: boolean;
  metricLabelMap: Record<string, string>;
  onRemove: () => void;
}

const LEVEL_ACCENTS: Record<AlarmRuleLevel, { border: string; background: string; tag: string }> = {
  CRITICAL: { border: '#ffccc7', background: 'rgba(255, 77, 79, 0.08)', tag: 'red' },
  WARNING: { border: '#ffe7ba', background: 'rgba(250, 173, 20, 0.1)', tag: 'orange' },
  INFO: { border: '#bae0ff', background: 'rgba(22, 119, 255, 0.08)', tag: 'blue' },
};

const getConditionTypeHint = (conditionType: AlarmConditionType): string => {
  switch (conditionType) {
    case 'THRESHOLD':
      return ALARM_TEXT.conditionHintThreshold;
    case 'COMPARE':
      return ALARM_TEXT.conditionHintCompare;
    case 'CONTINUOUS':
      return ALARM_TEXT.conditionHintContinuous;
    case 'ACCUMULATE':
      return ALARM_TEXT.conditionHintAccumulate;
    case 'CUSTOM':
      return ALARM_TEXT.conditionHintCustom;
    default:
      return ALARM_TEXT.conditionHintThreshold;
  }
};

const getLevelLabel = (level?: AlarmRuleLevel): string =>
  LEVEL_OPTIONS.find((item) => item.value === level)?.label || level || '--';

const resetConditionMetrics = (form: FormInstance, groups: AlarmRuleGroupFormValues[]) => {
  groups.forEach((group, groupIndex) => {
    (group.conditions || []).forEach((_, conditionIndex) => {
      form.setFieldValue(['ruleGroups', groupIndex, 'conditions', conditionIndex, 'metricKey'], undefined);
    });
  });
};

/**
 * Single-select metric picker that still accepts identifiers missing from the thing model.
 *
 * A plain Select would silently force users to abandon a metric when the product has no
 * properties yet; a tags-mode Select would let them pick several. Instead the currently
 * typed keyword is offered as a "custom identifier" option so one value can be chosen and
 * the rule can still be saved.
 */
const MetricSelect: React.FC<{
  id?: string;
  value?: string;
  onChange?: (value?: string) => void;
  options: AlarmMetricOption[];
  loading?: boolean;
  placeholder?: string;
}> = ({ id, value, onChange, options, loading, placeholder }) => {
  const [keyword, setKeyword] = useState('');
  const mergedOptions = useMemo(() => {
    const nextOptions = [...options];
    if (value && !nextOptions.some((item) => item.value === value)) {
      nextOptions.unshift({ value, label: value });
    }
    const trimmedKeyword = keyword.trim();
    if (trimmedKeyword && !nextOptions.some((item) => item.value === trimmedKeyword)) {
      nextOptions.push({ value: trimmedKeyword, label: `使用自定义标识“${trimmedKeyword}”` });
    }
    return nextOptions;
  }, [keyword, options, value]);

  return (
    <Select
      id={id}
      allowClear
      showSearch
      value={value}
      onChange={(next?: string) => onChange?.(next)}
      onSearch={setKeyword}
      onDropdownVisibleChange={(visible) => {
        if (!visible) {
          setKeyword('');
        }
      }}
      optionFilterProp="label"
      options={mergedOptions}
      placeholder={placeholder}
      loading={loading}
      notFoundContent={loading ? '加载物模型属性中…' : ALARM_TEXT.noMetricMatched}
    />
  );
};

const ConditionEditor: React.FC<ConditionEditorProps> = ({
  form,
  groupIndex,
  conditionIndex,
  canRemove,
  metricOptions,
  metricLoading,
  metricLabelMap,
  onRemove,
}) => {
  const path = ['ruleGroups', groupIndex, 'conditions', conditionIndex] as const;
  const conditionType =
    (Form.useWatch([...path, 'conditionType'], form) as AlarmConditionItemFormValues['conditionType']) ||
    DEFAULT_ALARM_CONDITION_ITEM.conditionType;
  const itemValues = (Form.useWatch(path, form) as AlarmConditionItemFormValues | undefined) || DEFAULT_ALARM_CONDITION_ITEM;
  const previewText = useMemo(() => describeAlarmConditionItem(itemValues, metricLabelMap), [itemValues, metricLabelMap]);
  const selectedConditionLabel =
    CONDITION_TYPE_OPTIONS.find((item) => item.value === conditionType)?.label || ALARM_TEXT.triggerType;

  return (
    <Card
      size="small"
      title={
        <Space wrap size={8}>
          <Typography.Text strong>{`${ALARM_TEXT.conditionItemTitle} ${conditionIndex + 1}`}</Typography.Text>
          <Tag color="blue">{selectedConditionLabel}</Tag>
        </Space>
      }
      extra={
        <Button type="text" danger icon={<DeleteOutlined />} disabled={!canRemove} onClick={onRemove}>
          {ALARM_TEXT.removeCondition}
        </Button>
      }
      style={{ marginBottom: 16, borderRadius: 12 }}
    >
      <Form.Item
        name={[conditionIndex, 'conditionType']}
        label={ALARM_TEXT.triggerType}
        rules={[{ required: true, message: ALARM_TEXT.conditionRequired }]}
      >
        <Segmented block options={CONDITION_TYPE_OPTIONS} />
      </Form.Item>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {getConditionTypeHint(conditionType)}
      </Typography.Paragraph>

      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item
            name={[conditionIndex, 'metricKey']}
            label={ALARM_TEXT.metric}
            rules={conditionType === 'CUSTOM' ? [] : [{ required: true, message: ALARM_TEXT.metricRequired }]}
          >
            {conditionType === 'CUSTOM' ? (
              <Input disabled placeholder={ALARM_TEXT.customExpressionMetricHint} />
            ) : (
              <MetricSelect
                options={metricOptions}
                loading={metricLoading}
                placeholder={ALARM_TEXT.metricPlaceholder}
              />
            )}
          </Form.Item>
        </Col>
      </Row>

      <Card
        size="small"
        title={ALARM_TEXT.conditionParameterTitle}
        style={{ marginBottom: 16, borderRadius: 12, background: '#fafafa', border: '1px dashed #d9d9d9' }}
      >
        {conditionType === 'THRESHOLD' && (
          <>
            <Alert
              showIcon
              type="info"
              message={ALARM_TEXT.thresholdAggregateFixed}
              style={{ marginBottom: 16 }}
            />
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name={[conditionIndex, 'operator']} label={ALARM_TEXT.operator}>
                  <Select options={OPERATOR_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name={[conditionIndex, 'threshold']} label={ALARM_TEXT.thresholdValue}>
                  <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {conditionType === 'COMPARE' && (
          <>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'aggregateType']} label={ALARM_TEXT.aggregateType}>
                  <Select options={AGGREGATE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'compareTarget']} label={ALARM_TEXT.compareTarget}>
                  <Select options={COMPARE_TARGET_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'threshold']} label={ALARM_TEXT.thresholdValue}>
                  <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'windowSize']} label={ALARM_TEXT.windowSize}>
                  <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.windowSizePlaceholder} min={1} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'windowUnit']} label={ALARM_TEXT.windowUnit}>
                  <Select options={WINDOW_UNIT_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'changeMode']} label={ALARM_TEXT.changeMode}>
                  <Select options={CHANGE_MODE_OPTIONS} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'changeDirection']} label={ALARM_TEXT.changeDirection}>
                  <Select options={CHANGE_DIRECTION_OPTIONS} />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {conditionType === 'CONTINUOUS' && (
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name={[conditionIndex, 'operator']} label={ALARM_TEXT.operator}>
                <Select options={OPERATOR_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[conditionIndex, 'threshold']} label={ALARM_TEXT.thresholdValue}>
                <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[conditionIndex, 'consecutiveCount']} label={ALARM_TEXT.consecutiveCount}>
                <InputNumber style={{ width: '100%' }} min={1} placeholder={ALARM_TEXT.consecutiveCountPlaceholder} />
              </Form.Item>
            </Col>
          </Row>
        )}

        {conditionType === 'ACCUMULATE' && (
          <>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'aggregateType']} label={ALARM_TEXT.aggregateType}>
                  <Select options={AGGREGATE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'operator']} label={ALARM_TEXT.operator}>
                  <Select options={OPERATOR_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name={[conditionIndex, 'threshold']} label={ALARM_TEXT.thresholdValue}>
                  <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
                </Form.Item>
              </Col>
            </Row>
            <Row gutter={12}>
              <Col xs={24} md={12}>
                <Form.Item name={[conditionIndex, 'windowSize']} label={ALARM_TEXT.windowSize}>
                  <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.windowSizePlaceholder} min={1} />
                </Form.Item>
              </Col>
              <Col xs={24} md={12}>
                <Form.Item name={[conditionIndex, 'windowUnit']} label={ALARM_TEXT.windowUnit}>
                  <Select options={WINDOW_UNIT_OPTIONS} />
                </Form.Item>
              </Col>
            </Row>
          </>
        )}

        {conditionType === 'CUSTOM' && (
          <Form.Item
            name={[conditionIndex, 'customExpr']}
            label={ALARM_TEXT.customExpression}
            rules={[{ required: true, message: ALARM_TEXT.customExprRequired }]}
          >
            <TextArea
              rows={4}
              placeholder={ALARM_TEXT.customExprPlaceholder}
              style={{ fontFamily: 'Consolas, Monaco, monospace', fontSize: 13 }}
            />
          </Form.Item>
        )}
      </Card>

      <Alert type="success" showIcon message={ALARM_TEXT.preview} description={previewText} />
    </Card>
  );
};

const RuleGroupEditor: React.FC<RuleGroupEditorProps> = ({
  form,
  groupIndex,
  canRemove,
  metricOptions,
  metricLoading,
  metricLabelMap,
  onRemove,
}) => {
  const basePath = ['ruleGroups', groupIndex] as const;
  const triggerMode =
    (Form.useWatch([...basePath, 'triggerMode'], form) as AlarmRuleGroupFormValues['triggerMode']) ||
    DEFAULT_ALARM_RULE_GROUP.triggerMode;
  const ruleGroup = (Form.useWatch(basePath, form) as AlarmRuleGroupFormValues | undefined) || DEFAULT_ALARM_RULE_GROUP;
  const conditionCount = ruleGroup.conditions?.length || 1;
  const level = (ruleGroup.level || DEFAULT_ALARM_RULE_GROUP.level) as AlarmRuleLevel;
  const levelLabel = getLevelLabel(level);
  const groupPreview = useMemo(
    () => describeAlarmConditionValues({ ruleGroups: [ruleGroup] }, metricLabelMap),
    [metricLabelMap, ruleGroup],
  );
  const levelAccent = LEVEL_ACCENTS[level];

  return (
    <Card
      size="small"
      title={
        <Space wrap size={8}>
          <Typography.Text strong>{`${ALARM_TEXT.ruleGroupTitle} ${groupIndex + 1}`}</Typography.Text>
          <Tag color={levelAccent.tag}>{levelLabel}</Tag>
          <Tag color="processing">{getAlarmTriggerModeLabel(triggerMode)}</Tag>
          <Tag>{`${conditionCount}${ALARM_TEXT.conditionCountSuffix}`}</Tag>
        </Space>
      }
      extra={
        <Button type="text" danger icon={<DeleteOutlined />} disabled={!canRemove} onClick={onRemove}>
          {ALARM_TEXT.removeRuleGroup}
        </Button>
      }
      style={{
        marginBottom: 20,
        borderRadius: 14,
        borderColor: levelAccent.border,
        background: levelAccent.background,
      }}
    >
      <Row gutter={[12, 12]} style={{ marginBottom: 8 }}>
        <Col xs={24} lg={12}>
          <Form.Item
            name={[groupIndex, 'level']}
            label={ALARM_TEXT.ruleGroupLevel}
            rules={[{ required: true, message: ALARM_TEXT.levelRequired }]}
            style={{ marginBottom: 8 }}
          >
            <Segmented block options={LEVEL_OPTIONS} />
          </Form.Item>
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {ALARM_TEXT.levelStepHint}
          </Typography.Text>
        </Col>
        <Col xs={24} lg={12}>
          <Form.Item
            name={[groupIndex, 'triggerMode']}
            label={ALARM_TEXT.triggerMode}
            rules={[{ required: true, message: ALARM_TEXT.triggerModeRequired }]}
            style={{ marginBottom: 8 }}
          >
            <Segmented block options={TRIGGER_MODE_OPTIONS} />
          </Form.Item>
          {triggerMode === 'AT_LEAST' ? (
            <Form.Item
              name={[groupIndex, 'matchCount']}
              label={ALARM_TEXT.matchCount}
              rules={[{ required: true, message: ALARM_TEXT.matchCountRequired }]}
              style={{ marginBottom: 4 }}
            >
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                max={conditionCount}
                placeholder={ALARM_TEXT.matchCountPlaceholder}
              />
            </Form.Item>
          ) : null}
          <Typography.Text type="secondary" style={{ fontSize: 12 }}>
            {ALARM_TEXT.triggerModeHint}
          </Typography.Text>
        </Col>
      </Row>

      <Divider orientation="left" style={{ marginTop: 8 }}>
        {ALARM_TEXT.stepConfigureConditions}
      </Divider>

      <Form.List name={[groupIndex, 'conditions']}>
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <ConditionEditor
                key={field.key}
                form={form}
                groupIndex={groupIndex}
                conditionIndex={field.name}
                canRemove={fields.length > 1}
                metricOptions={metricOptions}
                metricLoading={metricLoading}
                metricLabelMap={metricLabelMap}
                onRemove={() => remove(field.name)}
              />
            ))}
            <Button
              block
              icon={<PlusOutlined />}
              onClick={() => add({ ...DEFAULT_ALARM_CONDITION_ITEM })}
              style={{ marginBottom: 16, borderRadius: 10 }}
            >
              {ALARM_TEXT.addCondition}
            </Button>
          </>
        )}
      </Form.List>

      <Alert type="success" showIcon message={ALARM_TEXT.ruleGroupPreview} description={groupPreview} />
    </Card>
  );
};

const AlarmRuleForm: React.FC<Props> = ({
  form,
  projectOptions,
  productOptions,
  deviceOptions,
  metricOptions,
  metricLoading = false,
  metricLoaded = false,
  metricError,
  onRetryMetric,
  metricLabelMap,
  notificationMethodOptions,
  recipientGroupOptions,
  recipientUserOptions,
  currentStep,
  showEnabled = false,
}) => {
  const navigate = useNavigate();
  const projectId = Form.useWatch('projectId', form) as number | undefined;
  const productId = Form.useWatch('productId', form) as number | undefined;
  const deviceId = Form.useWatch('deviceId', form) as number | undefined;
  const notifyChannelsValue = Form.useWatch('notifyChannels', form) as AlarmNotificationMethod[] | undefined;
  const recipientGroupCodesValue = Form.useWatch('recipientGroupCodes', form) as string[] | undefined;
  const recipientUsernamesValue = Form.useWatch('recipientUsernames', form) as string[] | undefined;
  const notifyChannels = useMemo(() => notifyChannelsValue || [], [notifyChannelsValue]);
  const recipientGroupCodes = useMemo(() => recipientGroupCodesValue || [], [recipientGroupCodesValue]);
  const recipientUsernames = useMemo(() => recipientUsernamesValue || [], [recipientUsernamesValue]);
  const watchedValues = (Form.useWatch([], form) || {}) as AlarmRuleGroupFormValues & {
    ruleGroups?: AlarmRuleGroupFormValues[];
  };
  const ruleGroups = watchedValues.ruleGroups || DEFAULT_ALARM_CONDITION_VALUES.ruleGroups;
  const conditionTotal = ruleGroups.reduce((sum, item) => sum + (item.conditions?.length || 0), 0);
  const selectedMetricCount = ruleGroups.reduce(
    (sum, group) =>
      sum + (group.conditions || []).filter((item) => item.conditionType !== 'CUSTOM' && Boolean(item.metricKey)).length,
    0,
  );

  const projectPinnedLabel = projectOptions.find((item) => item.value === projectId)?.label;
  const productPinnedLabel = productOptions.find((item) => item.value === productId)?.label;
  const devicePinnedLabel = deviceOptions.find((item) => item.value === deviceId)?.label;

  const previewText = useMemo(() => describeAlarmConditionValues({ ruleGroups }, metricLabelMap), [metricLabelMap, ruleGroups]);
  const primaryLevel = useMemo(
    () => LEVEL_OPTIONS.find((item) => item.value === deriveAlarmRuleLevel({ ruleGroups }))?.label || '--',
    [ruleGroups],
  );
  const recipientGroupLabelMap = useMemo(
    () => Object.fromEntries(recipientGroupOptions.map((item) => [item.value, item.label])),
    [recipientGroupOptions],
  );
  const recipientUserLabelMap = useMemo(
    () => Object.fromEntries(recipientUserOptions.map((item) => [item.value, item.label])),
    [recipientUserOptions],
  );
  const notifyPreview = useMemo(
    () =>
      describeAlarmNotifyConfig(
        {
          notifyChannels,
          recipientGroupCodes,
          recipientUsernames,
        },
        recipientGroupLabelMap,
        recipientUserLabelMap,
      ),
    [notifyChannels, recipientGroupCodes, recipientUsernames, recipientGroupLabelMap, recipientUserLabelMap],
  );

  // Switching project/product invalidates every selected metric (and any device under it).
  // Ask first so a long ruleset is never emptied by a single select change.
  const handleProjectChange = (nextProjectId?: number) => {
    if (nextProjectId === projectId) {
      return;
    }
    const previousProjectId = projectId;
    const applyChange = () => {
      form.setFieldValue('productId', undefined);
      form.setFieldValue('deviceId', undefined);
      resetConditionMetrics(form, ruleGroups);
    };
    if (selectedMetricCount > 0) {
      Modal.confirm({
        title: '切换项目将清空已选指标',
        content: `已选的 ${selectedMetricCount} 条条件指标将被清空，需要重新选择。是否继续切换？`,
        okText: '继续切换',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: applyChange,
        onCancel: () => form.setFieldValue('projectId', previousProjectId),
      });
      return;
    }
    form.setFieldValue('productId', undefined);
    form.setFieldValue('deviceId', undefined);
  };

  const handleProductChange = (nextProductId?: number) => {
    if (nextProductId === productId) {
      return;
    }
    const previousProductId = productId;
    const applyChange = () => {
      form.setFieldValue('deviceId', undefined);
      resetConditionMetrics(form, ruleGroups);
    };
    if (selectedMetricCount > 0) {
      Modal.confirm({
        title: '切换产品将清空已选指标',
        content: `已选的 ${selectedMetricCount} 条条件指标将被清空，需要重新选择。是否继续切换？`,
        okText: '继续切换',
        cancelText: '取消',
        okButtonProps: { danger: true },
        onOk: applyChange,
        onCancel: () => form.setFieldValue('productId', previousProductId),
      });
      return;
    }
    form.setFieldValue('deviceId', undefined);
  };

  const basicSection = (
    <Card title={ALARM_TEXT.basicCardTitle} style={{ borderRadius: 14 }}>
      <Row gutter={12}>
        <Col xs={24} lg={12}>
          <Form.Item
            name="name"
            label={ALARM_TEXT.ruleName}
            rules={[{ required: true, message: ALARM_TEXT.ruleNameRequired }]}
          >
            <Input placeholder={ALARM_TEXT.ruleNamePlaceholder} maxLength={256} />
          </Form.Item>
        </Col>
        <Col xs={24} lg={12}>
          <Form.Item name="description" label={ALARM_TEXT.description}>
            <TextArea rows={3} placeholder={ALARM_TEXT.descriptionPlaceholder} />
          </Form.Item>
        </Col>
      </Row>
    </Card>
  );

  const scopeSection = (
    <Card title={ALARM_TEXT.scopeCardTitle} style={{ borderRadius: 14 }}>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {ALARM_TEXT.scopeHint}
      </Typography.Paragraph>
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item name="projectId" label={ALARM_TEXT.project}>
            <RemoteScopeSelect<ProjectScopeRecord>
              value={projectId}
              onChange={handleProjectChange}
              pinnedLabel={projectPinnedLabel}
              placeholder="搜索并选择项目（名称或编码），可不限"
              loader={async (keyword) => {
                try {
                  const res = await projectApi.list({ pageNum: 1, pageSize: 20, keyword: keyword || undefined });
                  return (res.data.data?.records ?? []) as ProjectScopeRecord[];
                } catch (error) {
                  message.error(getErrorMessage(error, '搜索项目失败'));
                  throw error;
                }
              }}
              toOption={(item) => ({
                value: item.id,
                label: item.code ? `${item.code} / ${item.name || item.code}` : item.name || String(item.id),
              })}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Form.Item name="productId" label={ALARM_TEXT.product}>
            <RemoteScopeSelect<ProductScopeRecord>
              key={`product-${projectId ?? 'all'}`}
              value={productId}
              onChange={handleProductChange}
              pinnedLabel={productPinnedLabel}
              placeholder="搜索并选择产品（名称或 productKey）"
              loader={async (keyword) => {
                try {
                  const res = await productApi.list({
                    pageNum: 1,
                    pageSize: 20,
                    keyword: keyword || undefined,
                    projectId,
                  });
                  return (res.data.data?.records ?? []) as ProductScopeRecord[];
                } catch (error) {
                  message.error(getErrorMessage(error, '搜索产品失败'));
                  throw error;
                }
              }}
              toOption={(item) => ({
                value: item.id,
                label: item.productKey
                  ? `${item.name || item.productKey} (${item.productKey})`
                  : item.name || String(item.id),
              })}
            />
          </Form.Item>
        </Col>
      </Row>

      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item name="deviceId" label={ALARM_TEXT.device}>
            <RemoteScopeSelect<DeviceScopeRecord>
              key={`device-${projectId ?? 'all'}-${productId ?? 'all'}`}
              value={deviceId}
              pinnedLabel={devicePinnedLabel}
              placeholder="搜索并选择设备（名称或别名），可不选"
              loader={async (keyword) => {
                try {
                  const res = await deviceApi.list({
                    pageNum: 1,
                    pageSize: 20,
                    keyword: keyword || undefined,
                    projectId,
                    productId,
                  });
                  return (res.data.data?.records ?? []) as DeviceScopeRecord[];
                } catch (error) {
                  message.error(getErrorMessage(error, '搜索设备失败'));
                  throw error;
                }
              }}
              toOption={(item) => ({
                value: item.id,
                label: item.nickname
                  ? `${item.nickname} (${item.deviceName || item.id})`
                  : item.deviceName || String(item.id),
              })}
            />
          </Form.Item>
        </Col>
        <Col xs={24} md={12}>
          <Alert
            type="warning"
            showIcon
            message={ALARM_TEXT.primaryLevel}
            description={`${ALARM_TEXT.primaryLevelDescription}${primaryLevel}`}
            style={{ marginBottom: 24 }}
          />
        </Col>
      </Row>
    </Card>
  );

  const ruleGroupSection = (
    <Form.List name="ruleGroups">
      {(fields, { add, remove }) => (
        <Card
          title={ALARM_TEXT.ruleGroupList}
          extra={
            <Button
              type="primary"
              icon={<PlusOutlined />}
              onClick={() =>
                add({
                  ...DEFAULT_ALARM_RULE_GROUP,
                  conditions: [{ ...DEFAULT_ALARM_CONDITION_ITEM }],
                })
              }
            >
              {ALARM_TEXT.addRuleGroup}
            </Button>
          }
          style={{ borderRadius: 14 }}
        >
          <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
            {ALARM_TEXT.multipleConditionHint}
          </Typography.Paragraph>

          {!productId ? (
            <Alert
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
              message={ALARM_TEXT.metricSelectRecommended}
              description={ALARM_TEXT.metricSelectRecommendedDesc}
            />
          ) : null}
          {metricError ? (
            <Alert
              type="error"
              showIcon
              style={{ marginBottom: 16 }}
              message={ALARM_TEXT.loadThingModelError}
              description={metricError}
              action={
                onRetryMetric ? (
                  <Button size="small" onClick={onRetryMetric}>
                    {ALARM_TEXT.retry}
                  </Button>
                ) : null
              }
            />
          ) : null}
          {productId && !metricError && !metricLoading && metricLoaded && metricOptions.length === 0 ? (
            <Alert
              type="warning"
              showIcon
              style={{ marginBottom: 16 }}
              message={ALARM_TEXT.noMetricOptionsHint}
              action={
                <Space size={8}>
                  <Button size="small" onClick={() => navigate('/product')}>
                    {ALARM_TEXT.goThingModel}
                  </Button>
                  {onRetryMetric ? (
                    <Button size="small" onClick={onRetryMetric}>
                      {ALARM_TEXT.refreshMetrics}
                    </Button>
                  ) : null}
                </Space>
              }
            />
          ) : null}
          {productId && metricOptions.length > 0 ? (
            <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
              {ALARM_TEXT.propertyHint}
            </Typography.Paragraph>
          ) : null}

          {fields.map((field) => (
            <RuleGroupEditor
              key={field.key}
              form={form}
              groupIndex={field.name}
              canRemove={fields.length > 1}
              metricOptions={metricOptions}
              metricLoading={metricLoading}
              metricLabelMap={metricLabelMap}
              onRemove={() => remove(field.name)}
            />
          ))}
        </Card>
      )}
    </Form.List>
  );

  const notifySection = (
    <Card title={ALARM_TEXT.notifyCardTitle} style={{ borderRadius: 14 }}>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Form.Item name="notifyChannels" label={ALARM_TEXT.notificationMethod}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={notificationMethodOptions.map((item) => ({
                value: item.value,
                label: item.channelCount ? `${item.label} (${item.channelCount})` : item.label,
              }))}
              placeholder={ALARM_TEXT.notificationMethodPlaceholder}
            />
          </Form.Item>
          <Typography.Paragraph type="secondary" style={{ marginTop: -8 }}>
            {ALARM_TEXT.notificationMethodHint}
          </Typography.Paragraph>
        </Col>
        <Col xs={24} lg={12}>
          <Form.Item name="recipientGroupCodes" label={ALARM_TEXT.recipientGroup}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={recipientGroupOptions.map((item) => ({
                value: item.value,
                label: item.memberCount ? `${item.label} (${item.memberCount})` : item.label,
              }))}
              placeholder={ALARM_TEXT.recipientGroupPlaceholder}
            />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={[12, 12]}>
        <Col xs={24} lg={12}>
          <Form.Item name="recipientUsernames" label={ALARM_TEXT.recipientUsers}>
            <Select
              mode="multiple"
              allowClear
              showSearch
              optionFilterProp="label"
              options={recipientUserOptions}
              placeholder={ALARM_TEXT.recipientUsersPlaceholder}
              notFoundContent={ALARM_TEXT.noSelectableUsers}
            />
          </Form.Item>
        </Col>
        <Col xs={24} lg={12}>
          <Alert
            type={notifyChannels.length > 0 ? 'success' : 'info'}
            showIcon
            message={ALARM_TEXT.notificationPreview}
            description={notifyChannels.length > 0 ? notifyPreview : ALARM_TEXT.noNotificationConfig}
          />
        </Col>
      </Row>
    </Card>
  );

  const previewSection = (
    <>
      <Card title={ALARM_TEXT.preview} style={{ borderRadius: 14 }}>
        <Space direction="vertical" size={12} style={{ width: '100%' }}>
          <Alert type="success" showIcon message={ALARM_TEXT.preview} description={previewText} />
          <Alert
            type={notifyChannels.length > 0 ? 'success' : 'info'}
            showIcon
            message={ALARM_TEXT.notificationPreview}
            description={notifyChannels.length > 0 ? notifyPreview : ALARM_TEXT.noNotificationConfig}
          />
        </Space>
      </Card>

      {showEnabled && (
        <Card title={ALARM_TEXT.status} style={{ borderRadius: 14 }}>
          <Form.Item name="enabled" label={ALARM_TEXT.status} style={{ marginBottom: 0 }}>
            <Select
              options={[
                { value: true, label: ALARM_TEXT.enabled },
                { value: false, label: ALARM_TEXT.disabled },
              ]}
            />
          </Form.Item>
        </Card>
      )}
    </>
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      {currentStep === 'groups' ? (
        <Typography.Text type="secondary">
          {`当前 ${ruleGroups.length} 个等级块，共 ${conditionTotal} 条条件，规则主级别：${primaryLevel}`}
        </Typography.Text>
      ) : null}
      {currentStep === 'basic' && basicSection}
      {currentStep === 'scope' && scopeSection}
      {currentStep === 'groups' && ruleGroupSection}
      {currentStep === 'notify' && notifySection}
      {currentStep === 'preview' && previewSection}
    </Space>
  );
};

export default AlarmRuleForm;
