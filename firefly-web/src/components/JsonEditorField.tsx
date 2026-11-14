import React, { useCallback, useMemo } from 'react';
import { Alert, Button, Dropdown, Space, message } from 'antd';
import { FormatPainterOutlined, ThunderboltOutlined } from '@ant-design/icons';
import CodeEditorField from './CodeEditorField';

export interface JsonTemplate {
  key: string;
  label: string;
  value: string;
}

interface JsonEditorFieldProps {
  value?: string;
  onChange?: (value: string) => void;
  height?: number | string;
  path?: string;
  disabled?: boolean;
  templates?: JsonTemplate[];
  /** Hint rendered under the editor when the JSON is valid. */
  hint?: React.ReactNode;
}

export function isValidJson(text: string | undefined): boolean {
  if (!text || !text.trim()) {
    return false;
  }
  try {
    JSON.parse(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * JSON editor used by configuration forms (share policy, forwarding targets, collectors…).
 *
 * Compared with a raw textarea it adds syntax highlighting, one-click formatting and an
 * inline validity message, so users no longer discover a malformed payload only after submit.
 */
const JsonEditorField: React.FC<JsonEditorFieldProps> = ({
  value,
  onChange,
  height = 220,
  path = 'config.json',
  disabled,
  templates,
  hint,
}) => {
  const error = useMemo(() => {
    if (!value || !value.trim()) {
      return null;
    }
    try {
      JSON.parse(value);
      return null;
    } catch (parseError) {
      return parseError instanceof Error ? parseError.message : 'JSON 格式不正确';
    }
  }, [value]);

  const handleFormat = useCallback(() => {
    if (!value || !value.trim()) {
      message.warning('请先填写 JSON 内容');
      return;
    }
    try {
      const formatted = JSON.stringify(JSON.parse(value), null, 2);
      onChange?.(formatted);
      message.success('已格式化');
    } catch (parseError) {
      message.error(parseError instanceof Error ? parseError.message : 'JSON 格式不正确，无法格式化');
    }
  }, [onChange, value]);

  const templateItems = (templates ?? []).map((template) => ({
    key: template.key,
    label: template.label,
    onClick: () => onChange?.(template.value),
  }));

  return (
    <Space direction="vertical" size={8} style={{ width: '100%' }}>
      <Space size={8} wrap>
        <Button size="small" icon={<FormatPainterOutlined />} onClick={handleFormat} disabled={disabled}>
          格式化
        </Button>
        {templateItems.length > 0 ? (
          <Dropdown menu={{ items: templateItems }} disabled={disabled}>
            <Button size="small" icon={<ThunderboltOutlined />}>插入模板</Button>
          </Dropdown>
        ) : null}
        {hint ? <span style={{ fontSize: 12, color: '#64748b' }}>{hint}</span> : null}
      </Space>
      <div style={{ border: '1px solid #dbe4ee', borderRadius: 12, overflow: 'hidden' }}>
        <CodeEditorField
          language="json"
          path={path}
          value={value}
          onChange={(next) => onChange?.(next ?? '')}
          height={height}
          readOnly={disabled}
        />
      </div>
      {error ? (
        <Alert type="error" showIcon message={`JSON 格式错误：${error}`} />
      ) : null}
    </Space>
  );
};

export default JsonEditorField;
