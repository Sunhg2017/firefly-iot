import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Dropdown,
  Drawer,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Popconfirm,
  Progress,
  Row,
  Select,
  Space,
  Switch,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CopyOutlined,
  CodeOutlined,
  DeleteOutlined,
  DownloadOutlined,
  EditOutlined,
  HolderOutlined,
  PlusOutlined,
  ReloadOutlined,
  SaveOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { asyncTaskApi, fileApi, productApi } from '../../services/api';

type SectionKey = 'properties' | 'events' | 'services';
type EditorMode = 'visual' | 'json';

interface ProductTarget {
  id: number;
  name: string;
  productKey: string;
  status: string;
  protocol: string;
  nodeType: string;
}

interface ThingModelItem extends Record<string, unknown> {
  identifier?: string;
  name?: string;
  description?: string;
  dataType?: Record<string, unknown>;
  accessMode?: string;
  required?: boolean;
  type?: string;
  callType?: string;
  system?: boolean;
  readonly?: boolean;
  lifecycle?: boolean;
  inputData?: ThingModelParameter[];
  outputData?: ThingModelParameter[];
}

interface ThingModelParameter extends Record<string, unknown> {
  identifier?: string;
  name?: string;
  description?: string;
  required?: boolean;
  dataType?: Record<string, unknown>;
}

interface ThingModelRoot extends Record<string, unknown> {
  properties: ThingModelItem[];
  events: ThingModelItem[];
  services: ThingModelItem[];
}

interface ThingModelSection {
  key: SectionKey;
  title: string;
  emptyText: string;
  itemLabel: string;
}

interface ThingModelParseResult {
  root: ThingModelRoot | null;
  error: string | null;
}

interface ParameterFormValue {
  identifier: string;
  name?: string;
  description?: string;
  required?: boolean;
  type: string;
  unit?: string;
  min?: number | null;
  max?: number | null;
  precision?: number | null;
  length?: number | null;
  enumValuesText?: string;
  extraSpecsText?: string;
}

interface ItemFormValues {
  identifier: string;
  name: string;
  description?: string;
  accessMode?: 'r' | 'rw';
  required?: boolean;
  dataTypeType?: string;
  dataTypeUnit?: string;
  dataTypeMin?: number | null;
  dataTypeMax?: number | null;
  dataTypePrecision?: number | null;
  dataTypeLength?: number | null;
  dataTypeEnumValuesText?: string;
  dataTypeExtraSpecsText?: string;
  eventType?: 'info' | 'alert' | 'error';
  callType?: 'sync' | 'async';
  inputData?: ParameterFormValue[];
  outputData?: ParameterFormValue[];
}

interface ItemEditorState {
  section: SectionKey;
  index: number | null;
  original?: ThingModelItem;
}

interface TemplateDefinition {
  id: string;
  name: string;
  description: string;
  tags: string[];
  model: ThingModelRoot;
}

interface ParameterTemplateDefinition {
  id: string;
  name: string;
  description: string;
  template: ParameterFormValue;
}

interface DraggingState {
  section: SectionKey;
  index: number;
}

interface SheetImportTarget {
  kind: 'properties' | 'parameters';
  fieldName?: 'inputData' | 'outputData';
}

type SpreadsheetTemplateRow = Record<string, string | number | boolean | null>;

interface Props {
  product: ProductTarget | null;
  open: boolean;
  onClose: () => void;
}

const SECTION_CONFIGS: ThingModelSection[] = [
  { key: 'properties', title: '属性', emptyText: '暂无属性定义', itemLabel: '属性' },
  { key: 'events', title: '事件', emptyText: '暂无事件定义', itemLabel: '事件' },
  { key: 'services', title: '服务', emptyText: '暂无服务定义', itemLabel: '服务' },
];

const BUILTIN_SERVICE_IDENTIFIERS = ['online', 'offline', 'heartbeat'] as const;

const BUILTIN_SERVICE_ITEMS: ThingModelItem[] = [
  {
    identifier: 'online',
    name: '上线',
    description: '设备连接建立后上报在线状态',
    callType: 'async',
    system: true,
    readonly: true,
    lifecycle: true,
    inputData: [],
    outputData: [],
  },
  {
    identifier: 'offline',
    name: '离线',
    description: '设备断开或超时后上报离线状态',
    callType: 'async',
    system: true,
    readonly: true,
    lifecycle: true,
    inputData: [],
    outputData: [],
  },
  {
    identifier: 'heartbeat',
    name: '心跳',
    description: '设备周期性保活，维持在线状态',
    callType: 'async',
    system: true,
    readonly: true,
    lifecycle: true,
    inputData: [],
    outputData: [],
  },
];

const DEFAULT_THING_MODEL: ThingModelRoot = {
  properties: [],
  events: [],
  services: BUILTIN_SERVICE_ITEMS.map((item) => ({ ...item })),
};

const DEFAULT_THING_MODEL_TEXT = JSON.stringify(DEFAULT_THING_MODEL, null, 2);

const STATUS_LABELS: Record<string, string> = {
  DEVELOPMENT: '开发中',
  PUBLISHED: '已发布',
  DEPRECATED: '已废弃',
};

const NODE_TYPE_LABELS: Record<string, string> = {
  DEVICE: '直连设备',
  GATEWAY: '网关设备',
};

const DATA_TYPE_OPTIONS = [
  { value: 'int', label: '整数(int)' },
  { value: 'float', label: '浮点(float)' },
  { value: 'double', label: '双精度(double)' },
  { value: 'string', label: '字符串(string)' },
  { value: 'bool', label: '布尔(bool)' },
  { value: 'enum', label: '枚举(enum)' },
  { value: 'date', label: '时间(date)' },
  { value: 'array', label: '数组(array)' },
  { value: 'struct', label: '结构体(struct)' },
];

const ACCESS_MODE_OPTIONS = [
  { value: 'r', label: '只读' },
  { value: 'rw', label: '读写' },
];

const EVENT_TYPE_OPTIONS = [
  { value: 'info', label: '信息(info)' },
  { value: 'alert', label: '告警(alert)' },
  { value: 'error', label: '错误(error)' },
];

const CALL_TYPE_OPTIONS = [
  { value: 'sync', label: '同步(sync)' },
  { value: 'async', label: '异步(async)' },
];

const THING_MODEL_TEMPLATES: TemplateDefinition[] = [
  {
    id: 'environment-monitor',
    name: '环境监测基础模板',
    description: '适用于温湿度、空气质量、能耗采集等环境感知类产品。',
    tags: ['传感器', '环境', '常用'],
    model: {
      properties: [
        {
          identifier: 'temperature',
          name: '温度',
          description: '环境温度',
          accessMode: 'r',
          required: true,
          dataType: { type: 'float', unit: '℃', min: -40, max: 125, precision: 1 },
        },
        {
          identifier: 'humidity',
          name: '湿度',
          description: '环境相对湿度',
          accessMode: 'r',
          required: true,
          dataType: { type: 'float', unit: '%', min: 0, max: 100, precision: 1 },
        },
        {
          identifier: 'battery',
          name: '电量',
          description: '设备剩余电量',
          accessMode: 'r',
          required: false,
          dataType: { type: 'int', unit: '%', min: 0, max: 100 },
        },
      ],
      events: [
        {
          identifier: 'lowBattery',
          name: '低电量告警',
          description: '设备电量低于阈值时上报',
          type: 'alert',
          outputData: [
            {
              identifier: 'battery',
              name: '当前电量',
              required: true,
              dataType: { type: 'int', unit: '%', min: 0, max: 100 },
            },
          ],
        },
      ],
      services: [
        {
          identifier: 'syncTime',
          name: '时间同步',
          description: '为设备下发当前服务器时间',
          callType: 'sync',
          inputData: [],
          outputData: [
            {
              identifier: 'serverTime',
              name: '服务器时间',
              required: true,
              dataType: { type: 'date' },
            },
          ],
        },
      ],
    },
  },
  {
    id: 'smart-meter',
    name: '智能电表模板',
    description: '预置电压、电流、功率和告警服务，适合表计类设备快速起步。',
    tags: ['电表', '能耗', '功率'],
    model: {
      properties: [
        {
          identifier: 'voltage',
          name: '电压',
          accessMode: 'r',
          required: true,
          dataType: { type: 'float', unit: 'V', min: 0, max: 500, precision: 1 },
        },
        {
          identifier: 'current',
          name: '电流',
          accessMode: 'r',
          required: true,
          dataType: { type: 'float', unit: 'A', min: 0, max: 200, precision: 2 },
        },
        {
          identifier: 'power',
          name: '有功功率',
          accessMode: 'r',
          required: true,
          dataType: { type: 'float', unit: 'kW', min: 0, max: 5000, precision: 2 },
        },
      ],
      events: [
        {
          identifier: 'powerAlarm',
          name: '功率告警',
          type: 'alert',
          outputData: [
            {
              identifier: 'power',
              name: '当前功率',
              required: true,
              dataType: { type: 'float', unit: 'kW', min: 0, max: 5000, precision: 2 },
            },
          ],
        },
      ],
      services: [
        {
          identifier: 'resetEnergy',
          name: '电量清零',
          callType: 'async',
          inputData: [],
          outputData: [],
        },
      ],
    },
  },
  {
    id: 'video-device',
    name: '视频设备模板',
    description: '适合摄像机、NVR 等视频设备，包含流状态和抓图服务。',
    tags: ['视频', '摄像机', '流媒体'],
    model: {
      properties: [
        {
          identifier: 'streamStatus',
          name: '码流状态',
          accessMode: 'r',
          required: true,
          dataType: {
            type: 'enum',
            values: {
              '0': '离线',
              '1': '在线',
              '2': '推流中',
            },
          },
        },
        {
          identifier: 'recording',
          name: '录像状态',
          accessMode: 'r',
          required: false,
          dataType: { type: 'bool' },
        },
      ],
      events: [
        {
          identifier: 'motionDetected',
          name: '移动侦测',
          type: 'info',
          outputData: [
            {
              identifier: 'snapshotUrl',
              name: '抓拍地址',
              required: false,
              dataType: { type: 'string', length: 512 },
            },
          ],
        },
      ],
      services: [
        {
          identifier: 'captureSnapshot',
          name: '抓图',
          callType: 'async',
          inputData: [],
          outputData: [
            {
              identifier: 'snapshotUrl',
              name: '抓拍地址',
              required: true,
              dataType: { type: 'string', length: 512 },
            },
          ],
        },
      ],
    },
  },
  {
    id: 'gateway-basic',
    name: '网关管理模板',
    description: '适用于网关、边缘盒子等设备，预置子设备统计和扫描服务。',
    tags: ['网关', '边缘', '子设备'],
    model: {
      properties: [
        {
          identifier: 'childDeviceCount',
          name: '子设备数',
          accessMode: 'r',
          required: true,
          dataType: { type: 'int', min: 0, max: 100000 },
        },
        {
          identifier: 'signalStrength',
          name: '信号强度',
          accessMode: 'r',
          required: false,
          dataType: { type: 'int', unit: 'dBm', min: -150, max: 0 },
        },
      ],
      events: [
        {
          identifier: 'childOffline',
          name: '子设备离线',
          type: 'alert',
          outputData: [
            {
              identifier: 'childDeviceName',
              name: '子设备名称',
              required: true,
              dataType: { type: 'string', length: 128 },
            },
          ],
        },
      ],
      services: [
        {
          identifier: 'scanSubDevices',
          name: '扫描子设备',
          callType: 'async',
          inputData: [],
          outputData: [
            {
              identifier: 'foundCount',
              name: '发现数量',
              required: true,
              dataType: { type: 'int', min: 0, max: 100000 },
            },
          ],
        },
      ],
    },
  },
];

const PARAMETER_TEMPLATES: ParameterTemplateDefinition[] = [
  {
    id: 'temperature',
    name: '温度',
    description: '常用于环境、设备舱温度采集',
    template: {
      identifier: 'temperature',
      name: '温度',
      description: '温度值',
      required: true,
      type: 'float',
      unit: '℃',
      min: -40,
      max: 125,
      precision: 1,
      length: null,
      enumValuesText: '',
      extraSpecsText: '',
    },
  },
  {
    id: 'humidity',
    name: '湿度',
    description: '常用于环境湿度、仓储湿度采集',
    template: {
      identifier: 'humidity',
      name: '湿度',
      description: '湿度值',
      required: true,
      type: 'float',
      unit: '%',
      min: 0,
      max: 100,
      precision: 1,
      length: null,
      enumValuesText: '',
      extraSpecsText: '',
    },
  },
  {
    id: 'switch',
    name: '开关量',
    description: '适合阀门、继电器、开关状态',
    template: {
      identifier: 'switchStatus',
      name: '开关状态',
      description: '开关状态',
      required: true,
      type: 'enum',
      unit: '',
      min: null,
      max: null,
      precision: null,
      length: null,
      enumValuesText: JSON.stringify({ '0': '关闭', '1': '开启' }, null, 2),
      extraSpecsText: '',
    },
  },
  {
    id: 'battery',
    name: '电量',
    description: '适合低功耗设备剩余电量上报',
    template: {
      identifier: 'battery',
      name: '电量',
      description: '剩余电量',
      required: false,
      type: 'int',
      unit: '%',
      min: 0,
      max: 100,
      precision: null,
      length: null,
      enumValuesText: '',
      extraSpecsText: '',
    },
  },
  {
    id: 'timestamp',
    name: '时间戳',
    description: '适合作为事件发生时间、服务执行时间',
    template: {
      identifier: 'timestamp',
      name: '时间戳',
      description: '事件发生时间',
      required: true,
      type: 'date',
      unit: '',
      min: null,
      max: null,
      precision: null,
      length: null,
      enumValuesText: '',
      extraSpecsText: '',
    },
  },
];

const PROPERTY_IMPORT_TEMPLATE_ROWS: SpreadsheetTemplateRow[] = [
  {
    identifier: 'temperature',
    name: '环境温度',
    description: '设备上报的环境温度',
    type: 'float',
    accessMode: 'r',
    required: true,
    unit: '℃',
    min: -40,
    max: 125,
    precision: 1,
    length: null,
    enumValues: '',
    extraSpecs: '',
  },
  {
    identifier: 'switchStatus',
    name: '开关状态',
    description: '设备当前开关状态',
    type: 'enum',
    accessMode: 'rw',
    required: true,
    unit: '',
    min: null,
    max: null,
    precision: null,
    length: null,
    enumValues: '{"0":"关闭","1":"开启"}',
    extraSpecs: '',
  },
];

const PARAMETER_IMPORT_TEMPLATE_ROWS: SpreadsheetTemplateRow[] = [
  {
    identifier: 'threshold',
    name: '告警阈值',
    description: '设备配置的阈值参数',
    type: 'float',
    required: true,
    unit: '℃',
    min: -40,
    max: 125,
    precision: 1,
    length: null,
    enumValues: '',
    extraSpecs: '',
  },
  {
    identifier: 'mode',
    name: '运行模式',
    description: '设备运行模式',
    type: 'enum',
    required: false,
    unit: '',
    min: null,
    max: null,
    precision: null,
    length: null,
    enumValues: '{"auto":"自动","manual":"手动"}',
    extraSpecs: '',
  },
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'response' in error) {
    const response = (error as { response?: { data?: { message?: string } } }).response;
    if (response?.data?.message) {
      return response.data.message;
    }
  }
  return fallback;
};

const getSectionConfig = (section: SectionKey) =>
  SECTION_CONFIGS.find((item) => item.key === section) || SECTION_CONFIGS[0];

const getThingModelItemLabel = (item: unknown, fallbackPrefix: string, index: number) => {
  if (isRecord(item)) {
    const value = item.identifier ?? item.name ?? item.code ?? item.id;
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return `${fallbackPrefix}${index + 1}`;
};

const coerceThingModelItem = (value: unknown): ThingModelItem => {
  if (isRecord(value)) {
    return { ...value };
  }

  if (typeof value === 'string' && value.trim()) {
    return { name: value.trim() };
  }

  return {};
};

const coerceThingModelRoot = (value: Record<string, unknown>): ThingModelRoot => ({
  ...value,
  properties: Array.isArray(value.properties) ? value.properties.map(coerceThingModelItem) : [],
  events: Array.isArray(value.events) ? value.events.map(coerceThingModelItem) : [],
  services: Array.isArray(value.services) ? value.services.map(coerceThingModelItem) : [],
});

const isBuiltinServiceItem = (item: ThingModelItem | undefined) => {
  const identifier = typeof item?.identifier === 'string' ? item.identifier.trim() : '';
  return BUILTIN_SERVICE_IDENTIFIERS.includes(identifier as (typeof BUILTIN_SERVICE_IDENTIFIERS)[number]);
};

const ensureBuiltinServices = (root: ThingModelRoot): ThingModelRoot => ({
  ...root,
  services: [
    ...BUILTIN_SERVICE_ITEMS.map((item) => ({ ...item })),
    ...root.services.filter((item) => !isBuiltinServiceItem(item)),
  ],
});

const parseThingModelText = (rawText: string): ThingModelParseResult => {
  if (!rawText.trim()) {
    return { root: DEFAULT_THING_MODEL, error: null };
  }

  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (!isRecord(parsed)) {
      return {
        root: null,
        error: '物模型根节点必须是 JSON 对象',
      };
    }

    return {
      root: ensureBuiltinServices(coerceThingModelRoot(parsed)),
      error: null,
    };
  } catch (error) {
    return {
      root: null,
      error: error instanceof Error ? error.message : '物模型 JSON 解析失败',
    };
  }
};

const parseOptionalObjectText = (value: string | undefined, fieldLabel: string) => {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new Error(`${fieldLabel} 必须是合法的 JSON 对象`);
  }

  if (!isRecord(parsed)) {
    throw new Error(`${fieldLabel} 必须是 JSON 对象`);
  }

  return parsed;
};

const buildDataType = (
  fields: {
    type?: string;
    unit?: string;
    min?: number | null;
    max?: number | null;
    precision?: number | null;
    length?: number | null;
    enumValuesText?: string;
    extraSpecsText?: string;
  },
  original?: unknown,
) => {
  const next = isRecord(original) ? { ...original } : {};

  if (fields.type) {
    next.type = fields.type;
  } else {
    delete next.type;
  }

  if (fields.unit?.trim()) {
    next.unit = fields.unit.trim();
  } else {
    delete next.unit;
  }

  if (fields.min === null || fields.min === undefined) {
    delete next.min;
  } else {
    next.min = fields.min;
  }

  if (fields.max === null || fields.max === undefined) {
    delete next.max;
  } else {
    next.max = fields.max;
  }

  if (fields.precision === null || fields.precision === undefined) {
    delete next.precision;
  } else {
    next.precision = fields.precision;
  }

  if (fields.length === null || fields.length === undefined) {
    delete next.length;
  } else {
    next.length = fields.length;
  }

  const enumValues = parseOptionalObjectText(fields.enumValuesText, '枚举值');
  if (enumValues) {
    next.values = enumValues;
  } else {
    delete next.values;
  }

  const specs = parseOptionalObjectText(fields.extraSpecsText, '扩展 Specs');
  if (specs) {
    next.specs = specs;
  } else {
    delete next.specs;
  }

  return next;
};

const extractExtraDataTypeText = (dataType: Record<string, unknown>) => {
  if (isRecord(dataType.specs)) {
    return JSON.stringify(dataType.specs, null, 2);
  }

  return '';
};

const parameterToFormValue = (parameter: ThingModelParameter): ParameterFormValue => {
  const dataType = isRecord(parameter.dataType) ? parameter.dataType : {};
  return {
    identifier: typeof parameter.identifier === 'string' ? parameter.identifier : '',
    name: typeof parameter.name === 'string' ? parameter.name : '',
    description: typeof parameter.description === 'string' ? parameter.description : '',
    required: Boolean(parameter.required),
    type: typeof dataType.type === 'string' ? dataType.type : 'string',
    unit: typeof dataType.unit === 'string' ? dataType.unit : '',
    min: typeof dataType.min === 'number' ? dataType.min : null,
    max: typeof dataType.max === 'number' ? dataType.max : null,
    precision: typeof dataType.precision === 'number' ? dataType.precision : null,
    length: typeof dataType.length === 'number' ? dataType.length : null,
    enumValuesText: isRecord(dataType.values) ? JSON.stringify(dataType.values, null, 2) : '',
    extraSpecsText: extractExtraDataTypeText(dataType),
  };
};

const buildParameterFromForm = (
  value: ParameterFormValue,
  original?: ThingModelParameter,
): ThingModelParameter => {
  const next: ThingModelParameter = isRecord(original) ? { ...original } : {};
  next.identifier = value.identifier.trim();
  next.name = value.name?.trim() || undefined;
  next.description = value.description?.trim() || undefined;
  next.required = Boolean(value.required);
  next.dataType = buildDataType(
    {
      type: value.type,
      unit: value.unit,
      min: value.min,
      max: value.max,
      precision: value.precision,
      length: value.length,
      enumValuesText: value.enumValuesText,
      extraSpecsText: value.extraSpecsText,
    },
    original?.dataType,
  );
  return next;
};

const buildItemFromForm = (
  section: SectionKey,
  value: ItemFormValues,
  original?: ThingModelItem,
): ThingModelItem => {
  const next: ThingModelItem = isRecord(original) ? { ...original } : {};
  next.identifier = value.identifier.trim();
  next.name = value.name.trim();
  next.description = value.description?.trim() || undefined;

  if (section === 'properties') {
    next.dataType = buildDataType(
      {
        type: value.dataTypeType,
        unit: value.dataTypeUnit,
        min: value.dataTypeMin,
        max: value.dataTypeMax,
        precision: value.dataTypePrecision,
        length: value.dataTypeLength,
        enumValuesText: value.dataTypeEnumValuesText,
        extraSpecsText: value.dataTypeExtraSpecsText,
      },
      original?.dataType,
    );
    next.accessMode = value.accessMode || 'r';
    next.required = Boolean(value.required);
    delete next.type;
    delete next.callType;
    delete next.inputData;
    delete next.outputData;
    return next;
  }

  if (section === 'events') {
    next.type = value.eventType || 'info';
    next.outputData = Array.isArray(value.outputData)
      ? value.outputData.map((item, index) =>
          buildParameterFromForm(item, Array.isArray(original?.outputData) ? original?.outputData[index] : undefined),
        )
      : [];
    delete next.dataType;
    delete next.accessMode;
    delete next.required;
    delete next.callType;
    delete next.inputData;
    return next;
  }

  next.callType = value.callType || 'sync';
  next.inputData = Array.isArray(value.inputData)
    ? value.inputData.map((item, index) =>
        buildParameterFromForm(item, Array.isArray(original?.inputData) ? original?.inputData[index] : undefined),
      )
    : [];
  next.outputData = Array.isArray(value.outputData)
    ? value.outputData.map((item, index) =>
        buildParameterFromForm(item, Array.isArray(original?.outputData) ? original?.outputData[index] : undefined),
      )
    : [];
  delete next.dataType;
  delete next.accessMode;
  delete next.required;
  delete next.type;
  return next;
};

const itemToFormValues = (section: SectionKey, item?: ThingModelItem): ItemFormValues => {
  if (!item) {
    if (section === 'properties') {
      return {
        identifier: '',
        name: '',
        description: '',
        accessMode: 'r',
        required: false,
        dataTypeType: 'string',
        dataTypeUnit: '',
        dataTypeMin: null,
        dataTypeMax: null,
        dataTypePrecision: null,
        dataTypeLength: null,
        dataTypeEnumValuesText: '',
        dataTypeExtraSpecsText: '',
      };
    }

    if (section === 'events') {
      return {
        identifier: '',
        name: '',
        description: '',
        eventType: 'info',
        outputData: [],
      };
    }

    return {
      identifier: '',
      name: '',
      description: '',
      callType: 'sync',
      inputData: [],
      outputData: [],
    };
  }

  if (section === 'properties') {
    const dataType = isRecord(item.dataType) ? item.dataType : {};
    return {
      identifier: typeof item.identifier === 'string' ? item.identifier : '',
      name: typeof item.name === 'string' ? item.name : '',
      description: typeof item.description === 'string' ? item.description : '',
      accessMode: item.accessMode === 'rw' ? 'rw' : 'r',
      required: Boolean(item.required),
      dataTypeType: typeof dataType.type === 'string' ? dataType.type : 'string',
      dataTypeUnit: typeof dataType.unit === 'string' ? dataType.unit : '',
      dataTypeMin: typeof dataType.min === 'number' ? dataType.min : null,
      dataTypeMax: typeof dataType.max === 'number' ? dataType.max : null,
      dataTypePrecision: typeof dataType.precision === 'number' ? dataType.precision : null,
      dataTypeLength: typeof dataType.length === 'number' ? dataType.length : null,
      dataTypeEnumValuesText: isRecord(dataType.values) ? JSON.stringify(dataType.values, null, 2) : '',
      dataTypeExtraSpecsText: extractExtraDataTypeText(dataType),
    };
  }

  if (section === 'events') {
    return {
      identifier: typeof item.identifier === 'string' ? item.identifier : '',
      name: typeof item.name === 'string' ? item.name : '',
      description: typeof item.description === 'string' ? item.description : '',
      eventType: item.type === 'alert' || item.type === 'error' ? (item.type as 'alert' | 'error') : 'info',
      outputData: Array.isArray(item.outputData)
        ? item.outputData.map((parameter) => parameterToFormValue(coerceThingModelItem(parameter)))
        : [],
    };
  }

  return {
    identifier: typeof item.identifier === 'string' ? item.identifier : '',
    name: typeof item.name === 'string' ? item.name : '',
    description: typeof item.description === 'string' ? item.description : '',
    callType: item.callType === 'async' ? 'async' : 'sync',
    inputData: Array.isArray(item.inputData)
      ? item.inputData.map((parameter) => parameterToFormValue(coerceThingModelItem(parameter)))
      : [],
    outputData: Array.isArray(item.outputData)
      ? item.outputData.map((parameter) => parameterToFormValue(coerceThingModelItem(parameter)))
      : [],
  };
};

const getPropertyMetaTags = (item: ThingModelItem) => {
  const dataType = isRecord(item.dataType) ? item.dataType : {};
  const tags = [];

  if (typeof dataType.type === 'string' && dataType.type) {
    tags.push(<Tag key="type">{dataType.type}</Tag>);
  }

  if (item.accessMode === 'rw') {
    tags.push(<Tag key="access">读写</Tag>);
  } else {
    tags.push(<Tag key="access">只读</Tag>);
  }

  if (item.required) {
    tags.push(
      <Tag key="required" color="gold">
        必填
      </Tag>,
    );
  }

  return tags;
};

const cloneThingModelItem = (item: ThingModelItem): ThingModelItem =>
  JSON.parse(JSON.stringify(item)) as ThingModelItem;

const createUniqueIdentifier = (items: ThingModelItem[], baseIdentifier: string) => {
  const normalized = (baseIdentifier || 'item').trim() || 'item';
  const existing = new Set(
    items
      .map((item) => (typeof item.identifier === 'string' ? item.identifier.trim() : ''))
      .filter(Boolean),
  );

  if (!existing.has(normalized)) {
    return normalized;
  }

  let index = 1;
  let candidate = `${normalized}_copy`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${normalized}_copy${index}`;
  }
  return candidate;
};

const createUniqueName = (items: ThingModelItem[], baseName: string) => {
  const normalized = (baseName || '新建物模型项').trim() || '新建物模型项';
  const existing = new Set(
    items
      .map((item) => (typeof item.name === 'string' ? item.name.trim() : ''))
      .filter(Boolean),
  );

  if (!existing.has(normalized)) {
    return normalized;
  }

  let index = 1;
  let candidate = `${normalized}副本`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${normalized}副本${index}`;
  }
  return candidate;
};

const createDuplicatedItem = (items: ThingModelItem[], item: ThingModelItem) => {
  const duplicated = cloneThingModelItem(item);
  duplicated.identifier = createUniqueIdentifier(items, `${duplicated.identifier || 'item'}`);
  duplicated.name = createUniqueName(items, `${duplicated.name || duplicated.identifier || '新建物模型项'}`);
  return duplicated;
};

const createUniqueParameterIdentifier = (items: ParameterFormValue[], baseIdentifier: string) => {
  const normalized = (baseIdentifier || 'param').trim() || 'param';
  const existing = new Set(items.map((item) => item.identifier?.trim()).filter(Boolean));
  if (!existing.has(normalized)) {
    return normalized;
  }

  let index = 1;
  let candidate = `${normalized}_${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${normalized}_${index}`;
  }
  return candidate;
};

const createUniqueParameterName = (items: ParameterFormValue[], baseName: string) => {
  const normalized = (baseName || '新参数').trim() || '新参数';
  const existing = new Set(items.map((item) => item.name?.trim()).filter(Boolean));
  if (!existing.has(normalized)) {
    return normalized;
  }

  let index = 1;
  let candidate = `${normalized}${index}`;
  while (existing.has(candidate)) {
    index += 1;
    candidate = `${normalized}${index}`;
  }
  return candidate;
};

const normalizeColumnKey = (value: string) =>
  value
    .trim()
    .replace(/[\s_-]/g, '')
    .replace(/[()（）]/g, '')
    .toLowerCase();

const toRowLookup = (row: Record<string, unknown>) => {
  const lookup = new Map<string, unknown>();
  Object.entries(row).forEach(([key, value]) => {
    lookup.set(normalizeColumnKey(key), value);
  });
  return lookup;
};

const readSpreadsheetCell = (lookup: Map<string, unknown>, aliases: string[]) => {
  for (const alias of aliases) {
    const value = lookup.get(normalizeColumnKey(alias));
    if (value !== undefined && value !== null && `${value}`.trim() !== '') {
      return value;
    }
  }
  return undefined;
};

const asTrimmedText = (value: unknown) => {
  if (value === undefined || value === null) {
    return '';
  }
  return `${value}`.trim();
};

const asOptionalNumber = (value: unknown) => {
  if (value === undefined || value === null || `${value}`.trim() === '') {
    return null;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const asBoolean = (value: unknown) => {
  const text = asTrimmedText(value).toLowerCase();
  if (!text) {
    return false;
  }
  return ['true', '1', 'yes', 'y', '是', '必填', 'required'].includes(text);
};

const asEnumValuesText = (value: unknown) => {
  if (value === undefined || value === null || `${value}`.trim() === '') {
    return '';
  }

  if (typeof value === 'object') {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return '';
    }
  }

  const raw = `${value}`.trim();
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return JSON.stringify(parsed, null, 2);
    }
  } catch {
    // fall through
  }

  const objectValue = raw
    .split(/[,\n;]/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((result, entry) => {
      const pair = entry.split(/[:=]/).map((part) => part.trim());
      if (pair.length >= 2 && pair[0]) {
        result[pair[0]] = pair.slice(1).join(':');
      }
      return result;
    }, {});

  return Object.keys(objectValue).length > 0 ? JSON.stringify(objectValue, null, 2) : '';
};

const readSpreadsheetRows = async (file: File) => {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array' });
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    throw new Error('导入文件中没有可读取的工作表');
  }

  const worksheet = workbook.Sheets[firstSheetName];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, {
    defval: '',
    raw: true,
  });

  return rows.filter((row) =>
    Object.values(row).some((value) => value !== undefined && value !== null && `${value}`.trim() !== ''),
  );
};

const downloadSpreadsheetTemplate = (fileName: string, sheetName: string, rows: SpreadsheetTemplateRow[]) => {
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  const worksheet = XLSX.utils.json_to_sheet(rows, { header: headers });
  worksheet['!cols'] = headers.map((header) => {
    const maxCellLength = rows.reduce((max, row) => {
      const value = row[header];
      return Math.max(max, `${value ?? ''}`.length);
    }, header.length);

    return { wch: Math.min(Math.max(maxCellLength + 2, 14), 32) };
  });

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, fileName);
};

const mapRowToParameterForm = (row: Record<string, unknown>, rowIndex: number): ParameterFormValue => {
  const lookup = toRowLookup(row);
  const identifier = asTrimmedText(
    readSpreadsheetCell(lookup, ['identifier', '标识符', '参数标识符', '字段标识', 'code']),
  );
  if (!identifier) {
    throw new Error(`第 ${rowIndex} 行缺少标识符(identifier)`);
  }

  const name = asTrimmedText(readSpreadsheetCell(lookup, ['name', '名称', '参数名称'])) || identifier;
  const type = asTrimmedText(readSpreadsheetCell(lookup, ['type', 'datatype', '数据类型', '类型'])) || 'string';

  return {
    identifier,
    name,
    description: asTrimmedText(readSpreadsheetCell(lookup, ['description', '描述', '说明'])) || undefined,
    required: asBoolean(readSpreadsheetCell(lookup, ['required', '是否必填', '必填'])),
    type,
    unit: asTrimmedText(readSpreadsheetCell(lookup, ['unit', '单位'])) || '',
    min: asOptionalNumber(readSpreadsheetCell(lookup, ['min', '最小值'])),
    max: asOptionalNumber(readSpreadsheetCell(lookup, ['max', '最大值'])),
    precision: asOptionalNumber(readSpreadsheetCell(lookup, ['precision', '精度'])),
    length: asOptionalNumber(readSpreadsheetCell(lookup, ['length', '长度'])),
    enumValuesText: asEnumValuesText(readSpreadsheetCell(lookup, ['enumvalues', '枚举值', 'values'])),
    extraSpecsText:
      asTrimmedText(readSpreadsheetCell(lookup, ['extraspecs', 'specs', '扩展specs', '扩展配置', '额外配置'])) || '',
  };
};

export const mapRowToPropertyItem = (row: Record<string, unknown>, rowIndex: number): ThingModelItem => {
  const lookup = toRowLookup(row);
  const parameter = mapRowToParameterForm(row, rowIndex);
  const accessModeValue =
    asTrimmedText(readSpreadsheetCell(lookup, ['accessmode', 'access', '读写模式', '访问模式'])) || 'r';
  const accessMode = accessModeValue.toLowerCase() === 'rw' || accessModeValue === '读写' ? 'rw' : 'r';

  return buildItemFromForm('properties', {
    identifier: parameter.identifier,
    name: parameter.name || parameter.identifier,
    description: parameter.description,
    accessMode,
    required: parameter.required,
    dataTypeType: parameter.type,
    dataTypeUnit: parameter.unit,
    dataTypeMin: parameter.min,
    dataTypeMax: parameter.max,
    dataTypePrecision: parameter.precision,
    dataTypeLength: parameter.length,
    dataTypeEnumValuesText: parameter.enumValuesText,
    dataTypeExtraSpecsText: parameter.extraSpecsText,
  });
};

const collectDuplicateIdentifiers = (items: Array<{ identifier?: string }>) => {
  const seen = new Set<string>();
  const duplicates = new Set<string>();
  items.forEach((item) => {
    const identifier = item.identifier?.trim();
    if (!identifier) {
      return;
    }
    if (seen.has(identifier)) {
      duplicates.add(identifier);
    } else {
      seen.add(identifier);
    }
  });
  return Array.from(duplicates);
};

const ProductThingModelDrawer: React.FC<Props> = ({ product, open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editorMode, setEditorMode] = useState<EditorMode>('visual');
  const [activeSection, setActiveSection] = useState<SectionKey>('properties');
  const [baselineModel, setBaselineModel] = useState<ThingModelRoot>(DEFAULT_THING_MODEL);
  const [draftModel, setDraftModel] = useState<ThingModelRoot>(DEFAULT_THING_MODEL);
  const [rawThingModel, setRawThingModel] = useState(DEFAULT_THING_MODEL_TEXT);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [itemEditor, setItemEditor] = useState<ItemEditorState | null>(null);
  const [templateLibraryOpen, setTemplateLibraryOpen] = useState(false);
  const [draggingItem, setDraggingItem] = useState<DraggingState | null>(null);
  const [dragOverItem, setDragOverItem] = useState<DraggingState | null>(null);
  const [itemForm] = Form.useForm<ItemFormValues>();
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const sheetImportInputRef = useRef<HTMLInputElement | null>(null);
  const [sheetImportTarget, setSheetImportTarget] = useState<SheetImportTarget | null>(null);
  const [importingProgress, setImportingProgress] = useState<number | null>(null);
  const isPublished = product?.status === 'PUBLISHED';

  const extraRootKeys = useMemo(
    () => Object.keys(draftModel).filter((key) => !SECTION_CONFIGS.some((section) => section.key === key)),
    [draftModel],
  );

  const isPublishedLockedItem = (section: SectionKey, index: number) =>
    Boolean(isPublished && index < baselineModel[section].length);

  const isBuiltinServiceAt = (section: SectionKey, index: number) =>
    section === 'services' && isBuiltinServiceItem(draftModel.services[index]);

  const syncDraftModel = (nextRoot: ThingModelRoot) => {
    const normalizedRoot = ensureBuiltinServices(nextRoot);
    setDraftModel(normalizedRoot);
    setRawThingModel(JSON.stringify(normalizedRoot, null, 2));
    setJsonError(null);
  };

  const loadThingModel = async () => {
    if (!product) {
      return;
    }

    setLoading(true);
    try {
      const res = await productApi.getThingModel(product.id);
      const payload = res.data.data;
      const text = typeof payload === 'string' && payload.trim() ? payload : DEFAULT_THING_MODEL_TEXT;
      const parsed = parseThingModelText(text);

      setRawThingModel(parsed.root ? JSON.stringify(parsed.root, null, 2) : text);
      setDraftModel(parsed.root || DEFAULT_THING_MODEL);
      setBaselineModel(parsed.root || DEFAULT_THING_MODEL);
      setJsonError(parsed.error);
      setEditorMode(parsed.error ? 'json' : 'visual');
      setActiveSection('properties');
      setItemEditor(null);
      setTemplateLibraryOpen(false);
      setDraggingItem(null);
      setDragOverItem(null);

      if (parsed.error) {
        message.warning('当前物模型 JSON 无法解析，请先在高级 JSON 中修复后再使用可视化编辑');
      }
    } catch (error) {
      message.error(getErrorMessage(error, '加载物模型失败'));
      setBaselineModel(DEFAULT_THING_MODEL);
      setDraftModel(DEFAULT_THING_MODEL);
      setRawThingModel(DEFAULT_THING_MODEL_TEXT);
      setJsonError(null);
      setEditorMode('visual');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open || !product) {
      return;
    }

    void loadThingModel();
  }, [open, product?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleJsonChange = (value: string) => {
    setRawThingModel(value);
    const parsed = parseThingModelText(value);
    if (parsed.root) {
      setDraftModel(parsed.root);
      setJsonError(null);
      return;
    }

    setJsonError(parsed.error);
  };

  const handleEditorModeChange = (key: string) => {
    if (key === 'visual' && jsonError) {
      message.warning('请先修复高级 JSON 中的错误，再切回可视化编辑');
      return;
    }

    setEditorMode(key as EditorMode);
  };

  const handleFormat = () => {
    const parsed = parseThingModelText(rawThingModel);
    if (!parsed.root) {
      message.warning('当前 JSON 有误，暂时无法格式化');
      return;
    }

    syncDraftModel(parsed.root);
  };

  const handleResetTemplate = () => {
    syncDraftModel(DEFAULT_THING_MODEL);
    setEditorMode('visual');
    setActiveSection('properties');
  };

  const handleSave = async () => {
    if (!product) {
      return;
    }

    const parsed = parseThingModelText(rawThingModel);
    if (!parsed.root) {
      message.error('请先修复物模型 JSON 后再保存');
      return;
    }

    setSaving(true);
    try {
      const payload = JSON.stringify(parsed.root, null, 2);
      await productApi.updateThingModel(product.id, payload);
      syncDraftModel(parsed.root);
      setBaselineModel(parsed.root);
      message.success('物模型保存成功');
    } catch (error) {
      message.error(getErrorMessage(error, '物模型保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleExportThingModel = () => {
    const parsed = parseThingModelText(rawThingModel);
    if (!parsed.root) {
      message.error('当前物模型无法导出，请先修复 JSON 错误');
      return;
    }

    const payload = JSON.stringify(parsed.root, null, 2);
    const blob = new Blob([payload], { type: 'application/json;charset=utf-8' });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const filename = `${product?.productKey || 'thing-model'}-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    window.URL.revokeObjectURL(url);
    message.success('物模型已导出');
  };

  const handleTriggerImport = () => {
    importInputRef.current?.click();
  };

  const handleImportThingModel = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    if (!file.name.toLowerCase().endsWith('.json')) {
      message.error('请导入 JSON 文件');
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseThingModelText(text);
      if (!parsed.root) {
        message.error(parsed.error || '导入文件解析失败');
        return;
      }

      syncDraftModel(parsed.root);
      setEditorMode('visual');
      setActiveSection('properties');
      message.success(`已导入物模型文件：${file.name}`);
    } catch {
      message.error('读取导入文件失败');
    }
  };

  const handleTriggerSheetImport = (target: SheetImportTarget) => {
    setSheetImportTarget(target);
    sheetImportInputRef.current?.click();
  };

  const handleDownloadPropertyTemplate = () => {
    const fileName = `${product?.productKey || 'thing-model'}-property-import-template.xlsx`;
    downloadSpreadsheetTemplate(fileName, 'properties', PROPERTY_IMPORT_TEMPLATE_ROWS);
    message.success('属性导入模板已下载');
  };

  const handleDownloadParameterTemplate = () => {
    const fileName = `${product?.productKey || 'thing-model'}-parameter-import-template.xlsx`;
    downloadSpreadsheetTemplate(fileName, 'parameters', PARAMETER_IMPORT_TEMPLATE_ROWS);
    message.success('参数导入模板已下载');
  };

  const handleSheetImportChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    const currentTarget = sheetImportTarget;
    setSheetImportTarget(null);

    if (!file || !currentTarget || !product?.id) {
      return;
    }

    const lowerName = file.name.toLowerCase();
    if (!lowerName.endsWith('.xlsx') && !lowerName.endsWith('.xls') && !lowerName.endsWith('.csv')) {
      message.error('请导入 Excel 或 CSV 文件');
      return;
    }

    // For properties import, use async backend processing (Rule 9)
    if (currentTarget.kind === 'properties') {
      try {
        setImportingProgress(0);
        
        // Step 1: Upload file to MinIO
        const uploadRes = await fileApi.upload(file, 'thing-model-import');
        const fileKey = uploadRes.data.data?.fileKey || uploadRes.data.data?.objectName;
        if (!fileKey) {
          throw new Error('上传文件失败');
        }
        setImportingProgress(20);

        // Step 2: Register async import task
        const fileFormat = lowerName.endsWith('.csv') ? 'CSV' : 'XLSX';
        const importRes = await productApi.importThingModel(product.id, {
          fileKey,
          fileFormat,
          importType: 'PROPERTIES',
        });
        const taskId = importRes.data.data as number;
        setImportingProgress(30);

        // Step 3: Poll task status
        const pollTask = async () => {
          let attempts = 0;
          const maxAttempts = 120;
          while (attempts < maxAttempts) {
            const res = await asyncTaskApi.get(taskId);
            const task = res.data.data as { status: string; progress?: number; errorMessage?: string };
            if (task.status === 'COMPLETED' || task.status === 'SUCCESS') {
              setImportingProgress(100);
              // Refresh thing model from backend
              setTimeout(async () => {
                try {
                  const tmRes = await productApi.getThingModel(product.id);
                  const parsed = parseThingModelText(tmRes.data.data || '{}');
                  if (parsed.root) {
                    syncDraftModel(parsed.root);
                  }
                } catch {
                  // ignore
                }
                setImportingProgress(null);
              }, 500);
              message.success('属性导入完成！');
              return;
            }
            if (task.status === 'FAILED') {
              throw new Error(task.errorMessage || '导入失败');
            }
            if (task.progress !== undefined) {
              setImportingProgress(Math.max(30, Math.min(95, task.progress)));
            }
            attempts += 1;
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
          throw new Error('任务超时，请在任务中心查看');
        };
        await pollTask();
      } catch (error) {
        message.error(error instanceof Error ? error.message : '导入失败');
        setImportingProgress(null);
      }
      return;
    }

    // For parameters import (smaller data), keep local parsing
    try {
      const rows = await readSpreadsheetRows(file);
      if (rows.length === 0) {
        message.warning('导入文件没有可识别的数据行');
        return;
      }

      if (currentTarget.kind === 'parameters' && currentTarget.fieldName) {
        const importedParameters = rows.map((row, index) => mapRowToParameterForm(row, index + 2));
        const existingParameters =
          (itemForm.getFieldValue(currentTarget.fieldName) as ParameterFormValue[] | undefined) || [];
        const duplicates = collectDuplicateIdentifiers([...existingParameters, ...importedParameters]);
        if (duplicates.length > 0) {
          message.error(`参数标识符重复：${duplicates.join('、')}`);
          return;
        }

        itemForm.setFieldValue(currentTarget.fieldName, [...existingParameters, ...importedParameters]);
        message.success(`已导入 ${importedParameters.length} 条参数清单`);
      }
    } catch (error) {
      message.error(error instanceof Error ? error.message : '导入参数清单失败');
    }
  };

  const openItemEditor = (section: SectionKey, index?: number) => {
    if (index !== undefined && isBuiltinServiceAt(section, index)) {
      message.warning('系统固有服务不可编辑，请保留上线、离线、心跳三个生命周期服务');
      return;
    }

    if (index !== undefined && isPublishedLockedItem(section, index)) {
      message.warning('已发布产品的既有物模型项不允许修改，如需复用可通过“复制”新增一项');
      return;
    }

    const currentItem = index === undefined ? undefined : draftModel[section][index];
    setItemEditor({
      section,
      index: index ?? null,
      original: currentItem,
    });
    itemForm.setFieldsValue(itemToFormValues(section, currentItem));
  };

  const closeItemEditor = () => {
    setItemEditor(null);
    itemForm.resetFields();
  };

  const handleDeleteItem = (section: SectionKey, index: number) => {
    if (isBuiltinServiceAt(section, index)) {
      message.warning('系统固有服务不可删除');
      return;
    }

    if (isPublishedLockedItem(section, index)) {
      message.warning('已发布产品的既有物模型项不允许删除');
      return;
    }

    const nextRoot: ThingModelRoot = {
      ...draftModel,
      [section]: draftModel[section].filter((_, itemIndex) => itemIndex !== index),
    };
    syncDraftModel(nextRoot);
    message.success(`${getSectionConfig(section).itemLabel}已删除`);
  };

  const handleDuplicateItem = (section: SectionKey, index: number) => {
    if (isBuiltinServiceAt(section, index)) {
      message.warning('系统固有服务不可复制');
      return;
    }

    const currentItem = draftModel[section][index];
    if (!currentItem) {
      return;
    }

    const duplicated = createDuplicatedItem(draftModel[section], currentItem);
    setItemEditor({
      section,
      index: null,
      original: duplicated,
    });
    itemForm.setFieldsValue(itemToFormValues(section, duplicated));
  };

  const mergeTemplateModel = (template: TemplateDefinition, replaceSections: boolean) => {
    if (replaceSections && isPublished) {
      message.warning('已发布产品仅允许追加模板，不允许覆盖现有物模型');
      return;
    }

    const nextRoot: ThingModelRoot = {
      ...draftModel,
      properties: replaceSections ? [] : [...draftModel.properties],
      events: replaceSections ? [] : [...draftModel.events],
      services: replaceSections ? [] : [...draftModel.services],
    };

    (['properties', 'events', 'services'] as SectionKey[]).forEach((section) => {
      const baseItems = nextRoot[section];
      template.model[section].forEach((item) => {
        const copied = createDuplicatedItem(baseItems, item);
        baseItems.push(copied);
      });
    });

    syncDraftModel(nextRoot);
    setActiveSection('properties');
    setTemplateLibraryOpen(false);
    message.success(replaceSections ? `已应用模板“${template.name}”` : `已追加模板“${template.name}”`);
  };

  const handleDragStart = (section: SectionKey, index: number) => {
    if (isPublished || isPublishedLockedItem(section, index)) {
      return;
    }

    setDraggingItem({ section, index });
    setDragOverItem({ section, index });
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>, section: SectionKey, index: number) => {
    if (!draggingItem || draggingItem.section !== section || draggingItem.index === index) {
      return;
    }

    event.preventDefault();
    setDragOverItem({ section, index });
  };

  const handleDrop = (section: SectionKey, index: number) => {
    if (!draggingItem || draggingItem.section !== section || draggingItem.index === index) {
      setDraggingItem(null);
      setDragOverItem(null);
      return;
    }

    const nextItems = [...draftModel[section]];
    const [movedItem] = nextItems.splice(draggingItem.index, 1);
    const insertIndex = index;
    nextItems.splice(insertIndex, 0, movedItem);

    syncDraftModel({
      ...draftModel,
      [section]: nextItems,
    });
    setDraggingItem(null);
    setDragOverItem(null);
  };

  const handleDragEnd = () => {
    setDraggingItem(null);
    setDragOverItem(null);
  };

  const handleSubmitItem = async () => {
    if (!itemEditor) {
      return;
    }

    try {
      const values = await itemForm.validateFields();
      const identifier = values.identifier.trim();
      const sectionItems = draftModel[itemEditor.section];
      const duplicateIndex = sectionItems.findIndex((item, index) => {
        if (itemEditor.index !== null && index === itemEditor.index) {
          return false;
        }
        return typeof item.identifier === 'string' && item.identifier.trim() === identifier;
      });

      if (duplicateIndex >= 0) {
        message.error(`同一${getSectionConfig(itemEditor.section).itemLabel}下标识符不能重复`);
        return;
      }

      const nextItem = buildItemFromForm(itemEditor.section, values, itemEditor.original);
      const nextItems = [...sectionItems];
      if (itemEditor.index === null) {
        nextItems.push(nextItem);
      } else {
        nextItems[itemEditor.index] = nextItem;
      }

      syncDraftModel({
        ...draftModel,
        [itemEditor.section]: nextItems,
      });

      closeItemEditor();
      message.success(itemEditor.index === null ? '物模型项已新增' : '物模型项已更新');
    } catch (error) {
      if (error instanceof Error) {
        message.error(error.message);
      }
    }
  };

  const renderParameterFormList = (fieldName: 'inputData' | 'outputData', title: string) => (
    <Form.List name={fieldName}>
      {(fields, { add, remove }) => (
        <Card
          size="small"
          title={title}
          extra={
            <Space wrap size={4}>
              <Button type="link" icon={<DownloadOutlined />} onClick={handleDownloadParameterTemplate}>
                下载模板
              </Button>
              <Button type="link" icon={<UploadOutlined />} onClick={() => handleTriggerSheetImport({ kind: 'parameters', fieldName })}>
                导入清单
              </Button>
              <Dropdown
                menu={{
                  items: PARAMETER_TEMPLATES.map((template) => ({
                    key: template.id,
                    label: (
                      <div>
                        <div style={{ fontWeight: 600 }}>{template.name}</div>
                        <div style={{ fontSize: 12, color: '#8c8c8c' }}>{template.description}</div>
                      </div>
                    ),
                    onClick: () => {
                      const existingItems =
                        (itemForm.getFieldValue(fieldName) as ParameterFormValue[] | undefined) || [];
                      const nextTemplate = JSON.parse(JSON.stringify(template.template)) as ParameterFormValue;
                      nextTemplate.identifier = createUniqueParameterIdentifier(existingItems, nextTemplate.identifier || 'param');
                      nextTemplate.name = createUniqueParameterName(existingItems, nextTemplate.name || '新参数');
                      add(nextTemplate);
                    },
                  })),
                }}
                trigger={['click']}
              >
                <Button type="link">参数模板</Button>
              </Dropdown>
              <Button
                type="link"
                icon={<PlusOutlined />}
                onClick={() =>
                  add({
                    identifier: '',
                    name: '',
                    description: '',
                    required: false,
                    type: 'string',
                    unit: '',
                    min: null,
                    max: null,
                    precision: null,
                    length: null,
                    enumValuesText: '',
                    extraSpecsText: '',
                  })
                }
              >
                添加参数
              </Button>
            </Space>
          }
        >
          <Typography.Text type="secondary" style={{ display: 'block', marginBottom: 12 }}>
            支持列：标识符(identifier)、名称(name)、描述(description)、数据类型(type)、单位(unit)、最小值(min)、最大值(max)、精度(precision)、长度(length)、枚举值(enumValues)、扩展Specs(extraSpecs)。
          </Typography.Text>
          {fields.length > 0 ? (
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              {fields.map((field, index) => (
                <Card
                  key={field.key}
                  size="small"
                  type="inner"
                  title={`参数 ${index + 1}`}
                  extra={
                    <Button type="link" danger icon={<DeleteOutlined />} onClick={() => remove(field.name)}>
                      删除
                    </Button>
                  }
                >
                  <Row gutter={12}>
                    <Col xs={24} md={12}>
                      <Form.Item
                        name={[field.name, 'identifier']}
                        label="标识符"
                        rules={[
                          { required: true, message: '请输入标识符' },
                          {
                            pattern: /^[a-zA-Z][a-zA-Z0-9_]{1,63}$/,
                            message: '标识符需以字母开头，仅支持字母、数字、下划线',
                          },
                        ]}
                      >
                        <Input placeholder="例如 temperature" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={12}>
                      <Form.Item name={[field.name, 'name']} label="名称" rules={[{ required: true, message: '请输入名称' }]}>
                        <Input placeholder="例如 温度" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item name={[field.name, 'description']} label="描述">
                    <Input placeholder="选填，用于说明参数含义" />
                  </Form.Item>

                  <Row gutter={12}>
                    <Col xs={24} md={8}>
                      <Form.Item name={[field.name, 'type']} label="数据类型" rules={[{ required: true, message: '请选择数据类型' }]}>
                        <Select options={DATA_TYPE_OPTIONS} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name={[field.name, 'unit']} label="单位">
                        <Input placeholder="例如 ℃ / s / %" />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={8}>
                      <Form.Item name={[field.name, 'required']} label="是否必填" valuePropName="checked">
                        <Switch checkedChildren="必填" unCheckedChildren="可选" />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Row gutter={12}>
                    <Col xs={24} md={6}>
                      <Form.Item name={[field.name, 'min']} label="最小值">
                        <InputNumber style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item name={[field.name, 'max']} label="最大值">
                        <InputNumber style={{ width: '100%' }} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item name={[field.name, 'precision']} label="精度">
                        <InputNumber style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    </Col>
                    <Col xs={24} md={6}>
                      <Form.Item name={[field.name, 'length']} label="长度">
                        <InputNumber style={{ width: '100%' }} min={0} />
                      </Form.Item>
                    </Col>
                  </Row>

                  <Form.Item
                    name={[field.name, 'enumValuesText']}
                    label="枚举值(JSON对象)"
                    tooltip='仅在枚举类型时填写，例如 {"0":"关闭","1":"开启"}'
                  >
                    <Input.TextArea rows={4} spellCheck={false} />
                  </Form.Item>

                  <Form.Item
                    name={[field.name, 'extraSpecsText']}
                    label="扩展 Specs(JSON对象)"
                    tooltip="选填，用于补充数组、结构体等复杂规格"
                  >
                    <Input.TextArea rows={4} spellCheck={false} />
                  </Form.Item>
                </Card>
              ))}
            </Space>
          ) : (
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={`暂无${title}`} />
          )}
        </Card>
      )}
    </Form.List>
  );

  const renderItemEditorForm = () => {
    if (!itemEditor) {
      return null;
    }

    const currentSection = itemEditor.section;

    return (
      <Form form={itemForm} layout="vertical" preserve={false}>
        <Row gutter={12}>
          <Col xs={24} md={12}>
            <Form.Item
              name="identifier"
              label="标识符"
              rules={[
                { required: true, message: '请输入标识符' },
                {
                  pattern: /^[a-zA-Z][a-zA-Z0-9_]{1,63}$/,
                  message: '标识符需以字母开头，仅支持字母、数字、下划线',
                },
              ]}
            >
              <Input placeholder="例如 temperature" />
            </Form.Item>
          </Col>
          <Col xs={24} md={12}>
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="例如 温度" />
            </Form.Item>
          </Col>
        </Row>

        <Form.Item name="description" label="描述">
          <Input.TextArea rows={3} placeholder="用于说明该物模型项的业务含义" />
        </Form.Item>

        {currentSection === 'properties' ? (
          <>
            <Row gutter={12}>
              <Col xs={24} md={8}>
                <Form.Item name="dataTypeType" label="数据类型" rules={[{ required: true, message: '请选择数据类型' }]}>
                  <Select options={DATA_TYPE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="accessMode" label="读写模式" rules={[{ required: true, message: '请选择读写模式' }]}>
                  <Select options={ACCESS_MODE_OPTIONS} />
                </Form.Item>
              </Col>
              <Col xs={24} md={8}>
                <Form.Item name="required" label="是否必填" valuePropName="checked">
                  <Switch checkedChildren="必填" unCheckedChildren="可选" />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} md={6}>
                <Form.Item name="dataTypeUnit" label="单位">
                  <Input placeholder="例如 ℃ / % / kWh" />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="dataTypeMin" label="最小值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="dataTypeMax" label="最大值">
                  <InputNumber style={{ width: '100%' }} />
                </Form.Item>
              </Col>
              <Col xs={24} md={6}>
                <Form.Item name="dataTypePrecision" label="精度">
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
            </Row>

            <Row gutter={12}>
              <Col xs={24} md={6}>
                <Form.Item name="dataTypeLength" label="长度">
                  <InputNumber style={{ width: '100%' }} min={0} />
                </Form.Item>
              </Col>
            </Row>

            <Form.Item
              name="dataTypeEnumValuesText"
              label="枚举值(JSON对象)"
              tooltip='仅在枚举类型时填写，例如 {"0":"关闭","1":"开启"}'
            >
              <Input.TextArea rows={4} spellCheck={false} />
            </Form.Item>

            <Form.Item
              name="dataTypeExtraSpecsText"
              label="扩展 Specs(JSON对象)"
              tooltip="选填，用于补充结构体、数组等复杂规格"
            >
              <Input.TextArea rows={4} spellCheck={false} />
            </Form.Item>
          </>
        ) : null}

        {currentSection === 'events' ? (
          <>
            <Form.Item name="eventType" label="事件级别" rules={[{ required: true, message: '请选择事件级别' }]}>
              <Select options={EVENT_TYPE_OPTIONS} />
            </Form.Item>
            {renderParameterFormList('outputData', '输出参数')}
          </>
        ) : null}

        {currentSection === 'services' ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Form.Item name="callType" label="调用方式" rules={[{ required: true, message: '请选择调用方式' }]}>
              <Select options={CALL_TYPE_OPTIONS} />
            </Form.Item>
            {renderParameterFormList('inputData', '输入参数')}
            {renderParameterFormList('outputData', '输出参数')}
          </Space>
        ) : null}
      </Form>
    );
  };

  const renderVisualSection = (section: SectionKey) => {
    const config = getSectionConfig(section);
    const items = draftModel[section] || [];
    const baselineCount = baselineModel[section].length;

    return (
      <Space direction="vertical" size={16} style={{ width: '100%' }}>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 12,
            flexWrap: 'wrap',
          }}
        >
          <div>
            <Typography.Title level={5} style={{ margin: 0 }}>
              {config.title}列表
            </Typography.Title>
            <Typography.Text type="secondary">
              {isPublished
                ? `当前产品已发布，前 ${baselineCount} 项已锁定，只允许在末尾新增。`
                : '通过表单维护常用字段，支持拖拽排序和模板快速生成。'}
            </Typography.Text>
          </div>
          <Space wrap>
            <Button onClick={() => setTemplateLibraryOpen(true)}>模板库</Button>
            {section === 'properties' ? (
              <>
                <Button icon={<DownloadOutlined />} onClick={handleDownloadPropertyTemplate}>
                  下载属性模板
                </Button>
                <Button icon={<UploadOutlined />} onClick={() => handleTriggerSheetImport({ kind: 'properties' })} disabled={importingProgress !== null}>
                导入属性清单
                </Button>
              </>
            ) : null}
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openItemEditor(section)}>
              新增{config.itemLabel}
            </Button>
          </Space>
        </div>

        {section === 'properties' ? (
          <Typography.Text type="secondary">
            可导入 Excel/CSV 属性清单，表头支持：标识符(identifier)、名称(name)、描述(description)、数据类型(type)、读写模式(accessMode)、是否必填(required)、单位(unit)、最小值(min)、最大值(max)、精度(precision)、长度(length)、枚举值(enumValues)。
          </Typography.Text>
        ) : null}

        {importingProgress !== null && (
          <Card size="small" style={{ marginTop: 12, marginBottom: 12 }}>
            <Progress percent={importingProgress} status={importingProgress === 100 ? 'success' : 'active'} />
            <Typography.Text type="secondary">正在异步导入属性清单，请稍候...</Typography.Text>
          </Card>
        )}

        {items.length > 0 ? (
          <Space direction="vertical" size={12} style={{ width: '100%' }}>
            {items.map((item, index) => {
              const dataType = isRecord(item.dataType) ? item.dataType : {};
              const outputCount = Array.isArray(item.outputData) ? item.outputData.length : 0;
              const inputCount = Array.isArray(item.inputData) ? item.inputData.length : 0;
              const isLocked = isPublishedLockedItem(section, index);
              const isBuiltin = isBuiltinServiceAt(section, index);
              const isDragTarget = dragOverItem?.section === section && dragOverItem.index === index && draggingItem?.index !== index;

              return (
                <div
                  key={`${section}-${item.identifier || item.name || index}`}
                  draggable={!isPublished && !isBuiltin}
                  onDragStart={() => handleDragStart(section, index)}
                  onDragOver={(event) => handleDragOver(event, section, index)}
                  onDrop={() => handleDrop(section, index)}
                  onDragEnd={handleDragEnd}
                  style={{
                    borderRadius: 12,
                    outline: isDragTarget ? '2px dashed #1677ff' : 'none',
                    outlineOffset: 2,
                  }}
                >
                  <Card
                    size="small"
                    bodyStyle={{ padding: 16 }}
                    actions={[
                      <Button
                        key="copy"
                        type="link"
                        icon={<CopyOutlined />}
                        disabled={isBuiltin}
                        onClick={() => handleDuplicateItem(section, index)}
                      >
                        复制
                      </Button>,
                      <Button
                        key="edit"
                        type="link"
                        icon={<EditOutlined />}
                        disabled={isLocked || isBuiltin}
                        onClick={() => openItemEditor(section, index)}
                      >
                        编辑
                      </Button>,
                      <Popconfirm
                        key="delete"
                        title={`确认删除该${config.itemLabel}吗？`}
                        okText="删除"
                        cancelText="取消"
                        disabled={isLocked || isBuiltin}
                        onConfirm={() => handleDeleteItem(section, index)}
                      >
                        <Button type="link" danger icon={<DeleteOutlined />} disabled={isLocked || isBuiltin}>
                          删除
                        </Button>
                      </Popconfirm>,
                    ]}
                  >
                    <Space direction="vertical" size={10} style={{ width: '100%' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                        <div>
                          <Space align="center" size={8}>
                            <Tag bordered={false} color="blue">
                              #{index + 1}
                            </Tag>
                            {!isPublished && !isBuiltin ? (
                              <Typography.Text type="secondary" style={{ cursor: 'grab' }}>
                                <HolderOutlined /> 拖拽排序
                              </Typography.Text>
                            ) : null}
                            {isBuiltin ? (
                              <Tag color="cyan">固有服务</Tag>
                            ) : null}
                            {isLocked ? (
                              <Tag color="gold">已发布锁定</Tag>
                            ) : isPublished ? (
                              <Tag color="green">新增项</Tag>
                            ) : null}
                          </Space>
                          <Typography.Title level={5} style={{ margin: '8px 0 0' }}>
                            {item.name || getThingModelItemLabel(item, config.itemLabel, index)}
                          </Typography.Title>
                          <Typography.Text type="secondary">
                            标识符：{item.identifier || `未设置${config.itemLabel}标识符`}
                          </Typography.Text>
                        </div>
                        <Space wrap>
                          {section === 'properties' ? getPropertyMetaTags(item) : null}
                          {section === 'events' ? (
                            <>
                              <Tag>{item.type || 'info'}</Tag>
                              <Tag color="blue">输出 {outputCount}</Tag>
                            </>
                          ) : null}
                          {section === 'services' ? (
                            <>
                              <Tag>{item.callType || 'sync'}</Tag>
                              <Tag color="blue">输入 {inputCount}</Tag>
                              <Tag color="purple">输出 {outputCount}</Tag>
                              {item.system ? <Tag color="cyan">system</Tag> : null}
                            </>
                          ) : null}
                        </Space>
                      </div>

                      {item.description ? (
                        <Typography.Paragraph style={{ marginBottom: 0 }}>
                          {item.description as string}
                        </Typography.Paragraph>
                      ) : (
                        <Typography.Text type="secondary">暂无描述</Typography.Text>
                      )}

                      {section === 'properties' && typeof dataType.unit === 'string' ? (
                        <Typography.Text type="secondary">单位：{dataType.unit}</Typography.Text>
                      ) : null}
                    </Space>
                  </Card>
                </div>
              );
            })}
          </Space>
        ) : (
          <Card size="small">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={config.emptyText} />
          </Card>
        )}
      </Space>
    );
  };

  return (
    <>
      <Drawer
        title={product ? `物模型管理 - ${product.name}` : '物模型管理'}
        open={open}
        onClose={onClose}
        width={1080}
        destroyOnClose
        extra={
          <Space wrap>
            <Button icon={<UploadOutlined />} onClick={handleTriggerImport}>
              导入
            </Button>
            <Button icon={<DownloadOutlined />} onClick={handleExportThingModel}>
              导出
            </Button>
            <Button icon={<ReloadOutlined />} loading={loading} onClick={() => void loadThingModel()}>
              重新加载
            </Button>
            <Button icon={<CodeOutlined />} onClick={handleFormat}>
              格式化
            </Button>
            <Button onClick={handleResetTemplate}>重置模板</Button>
            <Button type="primary" icon={<SaveOutlined />} loading={saving} onClick={() => void handleSave()}>
              保存物模型
            </Button>
          </Space>
        }
      >
        {product ? (
          <Space direction="vertical" size={16} style={{ width: '100%' }}>
            <Descriptions bordered size="small" column={2}>
              <Descriptions.Item label="产品名称">{product.name}</Descriptions.Item>
              <Descriptions.Item label="ProductKey">
                <Typography.Text copyable code>
                  {product.productKey}
                </Typography.Text>
              </Descriptions.Item>
              <Descriptions.Item label="状态">
                <Tag color={product.status === 'PUBLISHED' ? 'success' : 'processing'}>
                  {STATUS_LABELS[product.status] || product.status}
                </Tag>
              </Descriptions.Item>
              <Descriptions.Item label="节点类型">
                {NODE_TYPE_LABELS[product.nodeType] || product.nodeType}
              </Descriptions.Item>
              <Descriptions.Item label="接入协议">{product.protocol}</Descriptions.Item>
            </Descriptions>

            <Alert
              type={product.status === 'PUBLISHED' ? 'warning' : 'info'}
              showIcon
              message={
                product.status === 'PUBLISHED'
                  ? '当前产品已发布，既有物模型项仅可查看和复制，新增内容会追加在末尾，旧项不允许编辑、删除或重排。'
                  : '优先使用可视化表单维护属性、事件、服务；支持参数模板快速插入，也支持整份物模型 JSON 导入导出。'
              }
            />

            {extraRootKeys.length > 0 ? (
              <Alert
                type="info"
                showIcon
                message={`检测到额外顶层字段：${extraRootKeys.join('、')}。可视化编辑会保留它们，如需修改请切换到高级 JSON。`}
              />
            ) : null}

            <Row gutter={[12, 12]}>
              {SECTION_CONFIGS.map((section) => (
                <Col xs={24} md={8} key={section.key}>
                  <Card size="small">
                    <Typography.Text type="secondary">{section.title}</Typography.Text>
                    <div style={{ marginTop: 8, fontSize: 24, fontWeight: 700 }}>{draftModel[section.key].length}</div>
                  </Card>
                </Col>
              ))}
            </Row>

            <Tabs
              activeKey={editorMode}
              onChange={handleEditorModeChange}
              items={[
                {
                  key: 'visual',
                  label: '可视化编辑',
                  children: (
                    <Tabs
                      activeKey={activeSection}
                      onChange={(key) => setActiveSection(key as SectionKey)}
                      items={SECTION_CONFIGS.map((section) => ({
                        key: section.key,
                        label: `${section.title} (${draftModel[section.key].length})`,
                        children: renderVisualSection(section.key),
                      }))}
                    />
                  ),
                },
                {
                  key: 'json',
                  label: '高级 JSON',
                  children: (
                    <Space direction="vertical" size={16} style={{ width: '100%' }}>
                      {jsonError ? <Alert type="error" showIcon message={jsonError} /> : null}
                      <Card title="物模型 JSON" size="small">
                        <Input.TextArea
                          value={rawThingModel}
                          onChange={(event) => handleJsonChange(event.target.value)}
                          autoSize={{ minRows: 22, maxRows: 30 }}
                          spellCheck={false}
                          style={{ fontFamily: 'Consolas, Monaco, monospace' }}
                          placeholder={DEFAULT_THING_MODEL_TEXT}
                        />
                      </Card>
                    </Space>
                  ),
                },
              ]}
            />
          </Space>
        ) : null}
      </Drawer>

      <Modal
        title={
          itemEditor
            ? `${itemEditor.index === null ? '新增' : '编辑'}${getSectionConfig(itemEditor.section).itemLabel}`
            : '物模型项'
        }
        open={!!itemEditor}
        width={920}
        destroyOnClose
        onCancel={closeItemEditor}
        onOk={() => void handleSubmitItem()}
        okText={itemEditor?.index === null ? '新增' : '保存'}
        cancelText="取消"
      >
        {renderItemEditorForm()}
      </Modal>

      <input
        ref={importInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: 'none' }}
        onChange={(event) => void handleImportThingModel(event)}
      />

      <input
        ref={sheetImportInputRef}
        type="file"
        accept=".xlsx,.xls,.csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
        style={{ display: 'none' }}
        onChange={(event) => void handleSheetImportChange(event)}
      />

      <Modal
        title="物模型模板库"
        open={templateLibraryOpen}
        width={980}
        footer={null}
        destroyOnClose
        onCancel={() => setTemplateLibraryOpen(false)}
      >
        <Space direction="vertical" size={16} style={{ width: '100%' }}>
          <Alert
            type={isPublished ? 'warning' : 'info'}
            showIcon
            message={
              isPublished
                ? '已发布产品只允许把模板内容追加到当前物模型末尾，不允许覆盖现有定义。'
                : '可直接使用模板快速生成一套物模型，也可以只把模板追加到现有模型。'
            }
          />

          <Row gutter={[16, 16]}>
            {THING_MODEL_TEMPLATES.map((template) => (
              <Col xs={24} md={12} key={template.id}>
                <Card
                  size="small"
                  title={template.name}
                  extra={
                    <Space wrap>
                      <Button size="small" onClick={() => mergeTemplateModel(template, false)}>
                        追加模板
                      </Button>
                      <Button
                        size="small"
                        type="primary"
                        disabled={isPublished}
                        onClick={() => mergeTemplateModel(template, true)}
                      >
                        覆盖当前
                      </Button>
                    </Space>
                  }
                >
                  <Space direction="vertical" size={12} style={{ width: '100%' }}>
                    <Typography.Text>{template.description}</Typography.Text>
                    <Space wrap>
                      {template.tags.map((tag) => (
                        <Tag key={tag}>{tag}</Tag>
                      ))}
                    </Space>
                    <Row gutter={[8, 8]}>
                      <Col span={8}>
                        <Card size="small">
                          <Typography.Text type="secondary">属性</Typography.Text>
                          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>
                            {template.model.properties.length}
                          </div>
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small">
                          <Typography.Text type="secondary">事件</Typography.Text>
                          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>
                            {template.model.events.length}
                          </div>
                        </Card>
                      </Col>
                      <Col span={8}>
                        <Card size="small">
                          <Typography.Text type="secondary">服务</Typography.Text>
                          <div style={{ marginTop: 8, fontSize: 20, fontWeight: 700 }}>
                            {template.model.services.length}
                          </div>
                        </Card>
                      </Col>
                    </Row>
                  </Space>
                </Card>
              </Col>
            ))}
          </Row>
        </Space>
      </Modal>
    </>
  );
};

export default ProductThingModelDrawer;
