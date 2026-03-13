import React, { useMemo } from 'react';
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
  Row,
  Segmented,
  Select,
  Space,
  Tag,
  Typography,
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

const { TextArea } = Input;

export interface AlarmScopeOption {
  value: number;
  label: string;
  projectId?: number;
  productId?: number;
}

export interface AlarmMetricOption {
  value: string;
  label: string;
}

interface Props {
  form: FormInstance;
  projectOptions: AlarmScopeOption[];
  productOptions: AlarmScopeOption[];
  deviceOptions: AlarmScopeOption[];
  metricOptions: AlarmMetricOption[];
  metricLabelMap: Record<string, string>;
  showEnabled?: boolean;
}

interface ConditionEditorProps {
  form: FormInstance;
  groupIndex: number;
  conditionIndex: number;
  canRemove: boolean;
  metricOptions: AlarmMetricOption[];
  metricLabelMap: Record<string, string>;
  onRemove: () => void;
}

interface RuleGroupEditorProps {
  form: FormInstance;
  groupIndex: number;
  canRemove: boolean;
  metricOptions: AlarmMetricOption[];
  metricLabelMap: Record<string, string>;
  onRemove: () => void;
}

const LEVEL_ACCENTS: Record<AlarmRuleLevel, { border: string; background: string; tag: string }> = {
  CRITICAL: { border: '#ffccc7', background: 'rgba(255, 77, 79, 0.08)', tag: 'red' },
  WARNING: { border: '#ffe7ba', background: 'rgba(250, 173, 20, 0.1)', tag: 'orange' },
  INFO: { border: '#bae0ff', background: 'rgba(22, 119, 255, 0.08)', tag: 'blue' },
};

const OVERVIEW_CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e5e6eb',
  background: '#fafcff',
  height: '100%',
};

const STEP_PANEL_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '1px solid #e5e6eb',
  background: '#ffffff',
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

const OverviewStat: React.FC<{ title: string; value: string; color: string }> = ({ title, value, color }) => (
  <div
    style={{
      padding: '14px 16px',
      borderRadius: 12,
      background: '#fff',
      border: '1px solid #eef1f5',
      height: '100%',
    }}
  >
    <div style={{ fontSize: 12, color: '#8c8c8c', marginBottom: 6 }}>{title}</div>
    <div style={{ fontSize: 24, fontWeight: 700, color }}>{value}</div>
  </div>
);

const ConditionEditor: React.FC<ConditionEditorProps> = ({
  form,
  groupIndex,
  conditionIndex,
  canRemove,
  metricOptions,
  metricLabelMap,
  onRemove,
}) => {
  const path = ['ruleGroups', groupIndex, 'conditions', conditionIndex] as const;
  const productId = Form.useWatch('productId', form) as number | undefined;
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

      {!productId && conditionType !== 'CUSTOM' && (
        <Alert
          type="warning"
          showIcon
          style={{ marginBottom: 16 }}
          message={ALARM_TEXT.metricSelectRecommended}
          description={ALARM_TEXT.metricSelectRecommendedDesc}
        />
      )}

      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item
            name={[conditionIndex, 'metricKey']}
            label={ALARM_TEXT.metric}
            rules={conditionType === 'CUSTOM' ? [] : [{ required: true, message: ALARM_TEXT.metricRequired }]}
          >
            {conditionType === 'CUSTOM' ? (
              <Input disabled placeholder={ALARM_TEXT.customExpressionMetricHint} />
            ) : metricOptions.length > 0 ? (
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={metricOptions}
                placeholder={ALARM_TEXT.metricPlaceholder}
                notFoundContent={ALARM_TEXT.noMetricOptions}
              />
            ) : (
              <Input placeholder={ALARM_TEXT.metricPlaceholder} />
            )}
          </Form.Item>
        </Col>
      </Row>

      {conditionType !== 'CUSTOM' && (
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {ALARM_TEXT.propertyHint}
        </Typography.Paragraph>
      )}

      <Card
        size="small"
        title={ALARM_TEXT.conditionParameterTitle}
        style={{ marginBottom: 16, borderRadius: 12, background: '#fafafa', border: '1px dashed #d9d9d9' }}
      >
        {conditionType === 'THRESHOLD' && (
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
  const groupPreview = useMemo(() => describeAlarmConditionValues({ ruleGroups: [ruleGroup] }, metricLabelMap), [metricLabelMap, ruleGroup]);
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
        <Col xs={24} lg={8}>
          <Card size="small" title={ALARM_TEXT.stepChooseLevel} style={STEP_PANEL_STYLE}>
            <Form.Item
              name={[groupIndex, 'level']}
              label={ALARM_TEXT.ruleGroupLevel}
              rules={[{ required: true, message: ALARM_TEXT.levelRequired }]}
              style={{ marginBottom: 10 }}
            >
              <Segmented block options={LEVEL_OPTIONS} />
            </Form.Item>
            <Typography.Text type="secondary">{ALARM_TEXT.levelStepHint}</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title={ALARM_TEXT.stepChooseTrigger} style={STEP_PANEL_STYLE}>
            <Form.Item
              name={[groupIndex, 'triggerMode']}
              label={ALARM_TEXT.triggerMode}
              rules={[{ required: true, message: ALARM_TEXT.triggerModeRequired }]}
              style={{ marginBottom: 10 }}
            >
              <Segmented block options={TRIGGER_MODE_OPTIONS} />
            </Form.Item>
            <Typography.Text type="secondary">{ALARM_TEXT.triggerModeHint}</Typography.Text>
          </Card>
        </Col>
        <Col xs={24} lg={8}>
          <Card size="small" title={ALARM_TEXT.stepReviewStrategy} style={STEP_PANEL_STYLE}>
            {triggerMode === 'AT_LEAST' ? (
              <Form.Item
                name={[groupIndex, 'matchCount']}
                label={ALARM_TEXT.matchCount}
                rules={[{ required: true, message: ALARM_TEXT.matchCountRequired }]}
                style={{ marginBottom: 10 }}
              >
                <InputNumber
                  style={{ width: '100%' }}
                  min={1}
                  max={conditionCount}
                  placeholder={ALARM_TEXT.matchCountPlaceholder}
                />
              </Form.Item>
            ) : (
              <Alert
                type="info"
                showIcon
                message={ALARM_TEXT.triggerModeDescription}
                description={getAlarmTriggerModeLabel(triggerMode)}
                style={{ marginBottom: 10 }}
              />
            )}
            <Typography.Text type="secondary">{ALARM_TEXT.strategyStepHint}</Typography.Text>
          </Card>
        </Col>
      </Row>

      <Divider orientation="left" style={{ marginTop: 8 }}>
        {ALARM_TEXT.stepConfigureConditions}
      </Divider>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {ALARM_TEXT.groupConditionHint}
      </Typography.Paragraph>

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
  metricLabelMap,
  showEnabled = false,
}) => {
  const projectId = Form.useWatch('projectId', form) as number | undefined;
  const productId = Form.useWatch('productId', form) as number | undefined;
  const watchedValues = (Form.useWatch([], form) || {}) as AlarmRuleGroupFormValues & {
    ruleGroups?: AlarmRuleGroupFormValues[];
  };
  const ruleGroups = watchedValues.ruleGroups || DEFAULT_ALARM_CONDITION_VALUES.ruleGroups;
  const conditionTotal = ruleGroups.reduce((sum, item) => sum + (item.conditions?.length || 0), 0);

  const filteredProductOptions = useMemo(
    () => productOptions.filter((item) => !projectId || !item.projectId || item.projectId === projectId),
    [productOptions, projectId],
  );

  const filteredDeviceOptions = useMemo(
    () =>
      deviceOptions.filter((item) => {
        if (projectId && item.projectId && item.projectId !== projectId) {
          return false;
        }
        if (productId && item.productId && item.productId !== productId) {
          return false;
        }
        return true;
      }),
    [deviceOptions, productId, projectId],
  );

  const previewText = useMemo(() => describeAlarmConditionValues({ ruleGroups }, metricLabelMap), [metricLabelMap, ruleGroups]);
  const primaryLevel = useMemo(
    () => LEVEL_OPTIONS.find((item) => item.value === deriveAlarmRuleLevel({ ruleGroups }))?.label || '--',
    [ruleGroups],
  );

  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Card style={{ borderRadius: 14, border: '1px solid #dbeafe', background: 'linear-gradient(180deg, #f8fbff 0%, #ffffff 100%)' }}>
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <div>
            <Typography.Title level={5} style={{ marginBottom: 6 }}>
              {ALARM_TEXT.setupGuideTitle}
            </Typography.Title>
            <Typography.Text type="secondary">{ALARM_TEXT.setupGuideDescription}</Typography.Text>
          </div>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <Card size="small" style={OVERVIEW_CARD_STYLE}>
                <Typography.Text strong>{ALARM_TEXT.setupGuideBasic}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                  {ALARM_TEXT.setupGuideBasicDesc}
                </Typography.Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" style={OVERVIEW_CARD_STYLE}>
                <Typography.Text strong>{ALARM_TEXT.setupGuideScope}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                  {ALARM_TEXT.setupGuideScopeDesc}
                </Typography.Paragraph>
              </Card>
            </Col>
            <Col xs={24} md={8}>
              <Card size="small" style={OVERVIEW_CARD_STYLE}>
                <Typography.Text strong>{ALARM_TEXT.setupGuideBlocks}</Typography.Text>
                <Typography.Paragraph type="secondary" style={{ margin: '8px 0 0' }}>
                  {ALARM_TEXT.setupGuideBlocksDesc}
                </Typography.Paragraph>
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]}>
            <Col xs={24} md={8}>
              <OverviewStat title={ALARM_TEXT.configuredGroupCount} value={String(ruleGroups.length)} color="#1677ff" />
            </Col>
            <Col xs={24} md={8}>
              <OverviewStat title={ALARM_TEXT.configuredConditionCount} value={String(conditionTotal)} color="#13a8a8" />
            </Col>
            <Col xs={24} md={8}>
              <OverviewStat title={ALARM_TEXT.primaryLevel} value={primaryLevel} color="#cf1322" />
            </Col>
          </Row>
        </Space>
      </Card>

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

      <Card title={ALARM_TEXT.scopeCardTitle} style={{ borderRadius: 14 }}>
        <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
          {ALARM_TEXT.scopeHint}
        </Typography.Paragraph>
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="projectId" label={ALARM_TEXT.project}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={projectOptions}
                placeholder={ALARM_TEXT.projectPlaceholder}
                onChange={() => {
                  form.setFieldValue('productId', undefined);
                  form.setFieldValue('deviceId', undefined);
                  resetConditionMetrics(form, ruleGroups);
                }}
              />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="productId" label={ALARM_TEXT.product}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={filteredProductOptions}
                placeholder={ALARM_TEXT.productPlaceholder}
                onChange={() => {
                  form.setFieldValue('deviceId', undefined);
                  resetConditionMetrics(form, ruleGroups);
                }}
              />
            </Form.Item>
          </Col>
        </Row>

        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item name="deviceId" label={ALARM_TEXT.device}>
              <Select
                allowClear
                showSearch
                optionFilterProp="label"
                options={filteredDeviceOptions}
                placeholder={ALARM_TEXT.devicePlaceholder}
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

            {fields.map((field) => (
              <RuleGroupEditor
                key={field.key}
                form={form}
                groupIndex={field.name}
                canRemove={fields.length > 1}
                metricOptions={metricOptions}
                metricLabelMap={metricLabelMap}
                onRemove={() => remove(field.name)}
              />
            ))}
          </Card>
        )}
      </Form.List>

      <Card title={ALARM_TEXT.preview} style={{ borderRadius: 14 }}>
        <Alert type="success" showIcon message={ALARM_TEXT.preview} description={previewText} />
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
    </Space>
  );
};

export default AlarmRuleForm;
