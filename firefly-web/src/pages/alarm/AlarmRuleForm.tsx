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
  LEVEL_OPTIONS,
  OPERATOR_OPTIONS,
  WINDOW_UNIT_OPTIONS,
  describeAlarmConditionItem,
  describeAlarmConditionValues,
  deriveAlarmRuleLevel,
  type AlarmConditionItemFormValues,
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
  index: number;
  canRemove: boolean;
  metricOptions: AlarmMetricOption[];
  metricLabelMap: Record<string, string>;
  onRemove: () => void;
}

const resetConditionMetrics = (form: FormInstance, conditions: AlarmConditionItemFormValues[]) => {
  conditions.forEach((_, index) => {
    form.setFieldValue(['ruleConditions', index, 'metricKey'], undefined);
  });
};

const ConditionEditor: React.FC<ConditionEditorProps> = ({
  form,
  index,
  canRemove,
  metricOptions,
  metricLabelMap,
  onRemove,
}) => {
  const path = ['ruleConditions', index] as const;
  const conditionType =
    (Form.useWatch([...path, 'conditionType'], form) as AlarmConditionItemFormValues['conditionType']) ||
    DEFAULT_ALARM_CONDITION_ITEM.conditionType;
  const level = (Form.useWatch([...path, 'level'], form) as AlarmConditionItemFormValues['level']) || 'WARNING';
  const itemValues = (Form.useWatch(path, form) as AlarmConditionItemFormValues | undefined) || DEFAULT_ALARM_CONDITION_ITEM;
  const previewText = useMemo(
    () => describeAlarmConditionItem(itemValues, metricLabelMap),
    [itemValues, metricLabelMap],
  );

  return (
    <Card
      size="small"
      title={`${ALARM_TEXT.conditionItemTitle} ${index + 1}`}
      extra={
        <Space size={8}>
          <Typography.Text type="secondary">
            {ALARM_TEXT.level}: {LEVEL_OPTIONS.find((item) => item.value === level)?.label || level}
          </Typography.Text>
          <Button type="text" danger icon={<DeleteOutlined />} disabled={!canRemove} onClick={onRemove}>
            {ALARM_TEXT.removeCondition}
          </Button>
        </Space>
      }
      style={{ marginBottom: 16 }}
    >
      <Row gutter={12}>
        <Col xs={24} md={8}>
          <Form.Item
            name={[index, 'level']}
            label={ALARM_TEXT.conditionLevel}
            rules={[{ required: true, message: ALARM_TEXT.levelRequired }]}
          >
            <Select options={LEVEL_OPTIONS} placeholder={ALARM_TEXT.levelPlaceholder} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={[index, 'conditionType']}
            label={ALARM_TEXT.triggerType}
            rules={[{ required: true, message: ALARM_TEXT.conditionRequired }]}
          >
            <Select options={CONDITION_TYPE_OPTIONS} />
          </Form.Item>
        </Col>
        <Col xs={24} md={8}>
          <Form.Item
            name={[index, 'metricKey']}
            label={ALARM_TEXT.metric}
            rules={conditionType === 'CUSTOM' ? [] : [{ required: true, message: ALARM_TEXT.metricPlaceholder }]}
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
            <Form.Item name={[index, 'aggregateType']} label={ALARM_TEXT.aggregateType}>
              <Select options={AGGREGATE_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name={[index, 'operator']} label={ALARM_TEXT.operator}>
              <Select options={OPERATOR_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name={[index, 'threshold']} label={ALARM_TEXT.thresholdValue}>
              <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
            </Form.Item>
          </Col>
        </Row>
      )}

      {conditionType === 'COMPARE' && (
        <>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'aggregateType']} label={ALARM_TEXT.aggregateType}>
                <Select options={AGGREGATE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'compareTarget']} label={ALARM_TEXT.compareTarget}>
                <Select options={COMPARE_TARGET_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'threshold']} label={ALARM_TEXT.thresholdValue}>
                <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'windowSize']} label={ALARM_TEXT.windowSize}>
                <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.windowSizePlaceholder} min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'windowUnit']} label={ALARM_TEXT.windowUnit}>
                <Select options={WINDOW_UNIT_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'changeMode']} label={ALARM_TEXT.changeMode}>
                <Select options={CHANGE_MODE_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'changeDirection']} label={ALARM_TEXT.changeDirection}>
                <Select options={CHANGE_DIRECTION_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}

      {conditionType === 'CONTINUOUS' && (
        <Row gutter={12}>
          <Col xs={24} md={8}>
            <Form.Item name={[index, 'operator']} label={ALARM_TEXT.operator}>
              <Select options={OPERATOR_OPTIONS} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name={[index, 'threshold']} label={ALARM_TEXT.thresholdValue}>
              <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
            </Form.Item>
          </Col>
          <Col xs={24} md={8}>
            <Form.Item name={[index, 'consecutiveCount']} label={ALARM_TEXT.consecutiveCount}>
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
              <Form.Item name={[index, 'aggregateType']} label={ALARM_TEXT.aggregateType}>
                <Select options={AGGREGATE_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'operator']} label={ALARM_TEXT.operator}>
                <Select options={OPERATOR_OPTIONS} />
              </Form.Item>
            </Col>
            <Col xs={24} md={8}>
              <Form.Item name={[index, 'threshold']} label={ALARM_TEXT.thresholdValue}>
                <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.thresholdPlaceholder} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={12}>
            <Col xs={24} md={12}>
              <Form.Item name={[index, 'windowSize']} label={ALARM_TEXT.windowSize}>
                <InputNumber style={{ width: '100%' }} placeholder={ALARM_TEXT.windowSizePlaceholder} min={1} />
              </Form.Item>
            </Col>
            <Col xs={24} md={12}>
              <Form.Item name={[index, 'windowUnit']} label={ALARM_TEXT.windowUnit}>
                <Select options={WINDOW_UNIT_OPTIONS} />
              </Form.Item>
            </Col>
          </Row>
        </>
      )}

      {conditionType === 'CUSTOM' && (
        <Form.Item
          name={[index, 'customExpr']}
          label={ALARM_TEXT.customExpression}
          rules={[{ required: true, message: ALARM_TEXT.conditionRequired }]}
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
  const watchedValues = (Form.useWatch([], form) || {}) as AlarmConditionItemFormValues & {
    ruleConditions?: AlarmConditionItemFormValues[];
  };
  const ruleConditions = watchedValues.ruleConditions || DEFAULT_ALARM_CONDITION_VALUES.ruleConditions;

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
    () => describeAlarmConditionValues({ ruleConditions }, metricLabelMap),
    [metricLabelMap, ruleConditions],
  );

  const derivedLevel = useMemo(
    () => LEVEL_OPTIONS.find((item) => item.value === deriveAlarmRuleLevel({ ruleConditions }))?.label || '--',
    [ruleConditions],
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
                resetConditionMetrics(form, ruleConditions);
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
                resetConditionMetrics(form, ruleConditions);
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
            description={`${ALARM_TEXT.primaryLevelDescription}${derivedLevel}`}
            style={{ marginBottom: 24 }}
          />
        </Col>
      </Row>

      <Divider orientation="left">{ALARM_TEXT.conditionList}</Divider>
      <Typography.Paragraph type="secondary" style={{ marginBottom: 16 }}>
        {ALARM_TEXT.multipleConditionHint}
      </Typography.Paragraph>

      <Form.List name="ruleConditions">
        {(fields, { add, remove }) => (
          <>
            {fields.map((field) => (
              <ConditionEditor
                key={field.key}
                form={form}
                index={field.name}
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
