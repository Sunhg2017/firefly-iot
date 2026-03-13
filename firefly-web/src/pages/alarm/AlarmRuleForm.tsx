import React, { useMemo } from 'react';
import { DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Divider, Form, Input, InputNumber, Row, Select, Space, Typography } from 'antd';
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
  type AlarmRuleGroupFormValues,
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

const resetConditionMetrics = (form: FormInstance, groups: AlarmRuleGroupFormValues[]) => {
  groups.forEach((group, groupIndex) => {
    (group.conditions || []).forEach((_, conditionIndex) => {
      form.setFieldValue(['ruleGroups', groupIndex, 'conditions', conditionIndex, 'metricKey'], undefined);
    });
  });
};

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
  const conditionType =
    (Form.useWatch([...path, 'conditionType'], form) as AlarmConditionItemFormValues['conditionType']) ||
    DEFAULT_ALARM_CONDITION_ITEM.conditionType;
  const itemValues = (Form.useWatch(path, form) as AlarmConditionItemFormValues | undefined) || DEFAULT_ALARM_CONDITION_ITEM;
  const previewText = useMemo(
    () => describeAlarmConditionItem(itemValues, metricLabelMap),
    [itemValues, metricLabelMap],
  );

  return (
    <Card
      size="small"
      title={`${ALARM_TEXT.conditionItemTitle} ${conditionIndex + 1}`}
      extra={
        <Button type="text" danger icon={<DeleteOutlined />} disabled={!canRemove} onClick={onRemove}>
          {ALARM_TEXT.removeCondition}
        </Button>
      }
      style={{ marginBottom: 12 }}
    >
      <Row gutter={12}>
        <Col xs={24} md={12}>
          <Form.Item
            name={[conditionIndex, 'conditionType']}
            label={ALARM_TEXT.triggerType}
            rules={[{ required: true, message: ALARM_TEXT.conditionRequired }]}
          >
            <Select options={CONDITION_TYPE_OPTIONS} />
          </Form.Item>
        </Col>
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
              <InputNumber
                style={{ width: '100%' }}
                min={1}
                placeholder={ALARM_TEXT.consecutiveCountPlaceholder}
              />
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
  const levelLabel =
    LEVEL_OPTIONS.find((item) => item.value === ruleGroup.level)?.label || ruleGroup.level || DEFAULT_ALARM_RULE_GROUP.level;
  const groupPreview = useMemo(
    () => describeAlarmConditionValues({ ruleGroups: [ruleGroup] }, metricLabelMap),
    [metricLabelMap, ruleGroup],
  );

  return (
    <Card
      size="small"
      title={`${ALARM_TEXT.ruleGroupTitle} ${groupIndex + 1}`}
      extra={
        <Space size={8}>
          <Typography.Text type="secondary">{levelLabel}</Typography.Text>
          <Button type="text" danger icon={<DeleteOutlined />} disabled={!canRemove} onClick={onRemove}>
            {ALARM_TEXT.removeRuleGroup}
          </Button>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Row gutter={12}>
        <Col xs={24} md={8}>
          <Form.Item
            name={[groupIndex, 'level']}
            label={ALARM_TEXT.ruleGroupLevel}
            rules={[{ required: true, message: ALARM_TEXT.levelRequired }]}
          >
            <Select options={LEVEL_OPTIONS} placeholder={ALARM_TEXT.levelPlaceholder} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={[groupIndex, 'triggerMode']}
            label={ALARM_TEXT.triggerMode}
            rules={[{ required: true, message: ALARM_TEXT.triggerModeRequired }]}
          >
            <Select options={TRIGGER_MODE_OPTIONS} placeholder={ALARM_TEXT.triggerModePlaceholder} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          {triggerMode === 'AT_LEAST' ? (
            <Form.Item
              name={[groupIndex, 'matchCount']}
              label={ALARM_TEXT.matchCount}
              rules={[{ required: true, message: ALARM_TEXT.matchCountRequired }]}
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
            />
          )}
        </Col>
      </Row>

      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {ALARM_TEXT.triggerModeHint}
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
              style={{ marginBottom: 16 }}
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

  const previewText = useMemo(
    () => describeAlarmConditionValues({ ruleGroups }, metricLabelMap),
    [metricLabelMap, ruleGroups],
  );

  const primaryLevel = useMemo(
    () => LEVEL_OPTIONS.find((item) => item.value === deriveAlarmRuleLevel({ ruleGroups }))?.label || '--',
    [ruleGroups],
  );

  return (
    <>
      <Alert
        type="info"
        showIcon
        message={ALARM_TEXT.conditionTypeSummary}
        description={ALARM_TEXT.conditionTypeDescription}
        style={{ marginBottom: 16 }}
      />

      <Form.Item
        name="name"
        label={ALARM_TEXT.ruleName}
        rules={[{ required: true, message: ALARM_TEXT.ruleNameRequired }]}
      >
        <Input placeholder={ALARM_TEXT.ruleNamePlaceholder} maxLength={256} />
      </Form.Item>

      <Form.Item name="description" label={ALARM_TEXT.description}>
        <TextArea rows={2} placeholder={ALARM_TEXT.descriptionPlaceholder} />
      </Form.Item>

      <Divider orientation="left">{ALARM_TEXT.scope}</Divider>
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

      <Divider orientation="left">{ALARM_TEXT.ruleGroupList}</Divider>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {ALARM_TEXT.multipleConditionHint}
      </Typography.Paragraph>

      <Form.List name="ruleGroups">
        {(fields, { add, remove }) => (
          <>
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
            <Button
              block
              icon={<PlusOutlined />}
              onClick={() =>
                add({
                  ...DEFAULT_ALARM_RULE_GROUP,
                  conditions: [{ ...DEFAULT_ALARM_CONDITION_ITEM }],
                })
              }
              style={{ marginBottom: 16 }}
            >
              {ALARM_TEXT.addRuleGroup}
            </Button>
          </>
        )}
      </Form.List>

      <Alert
        type="success"
        showIcon
        message={ALARM_TEXT.preview}
        description={previewText}
        style={{ marginBottom: showEnabled ? 16 : 0 }}
      />

      {showEnabled && (
        <Form.Item name="enabled" label={ALARM_TEXT.status} style={{ marginTop: 16 }}>
          <Select
            options={[
              { value: true, label: ALARM_TEXT.enabled },
              { value: false, label: ALARM_TEXT.disabled },
            ]}
          />
        </Form.Item>
      )}
    </>
  );
};

export default AlarmRuleForm;
