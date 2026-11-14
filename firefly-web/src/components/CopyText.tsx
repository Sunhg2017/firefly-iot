import React, { useCallback } from 'react';
import { Button, Tooltip, Typography, message } from 'antd';
import { CopyOutlined } from '@ant-design/icons';

interface CopyTextProps {
  text?: string | number | null;
  /** Optional display node; defaults to the text itself. */
  children?: React.ReactNode;
  /** Truncate the display and show the full value in a tooltip. */
  ellipsis?: boolean;
  strong?: boolean;
  secondary?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

async function copyToClipboard(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
}

/**
 * Renders a value with copy-to-clipboard. Long identifiers (device names, secret keys,
 * trace ids, payloads) are otherwise painful to reuse in tickets or API clients.
 */
const CopyText: React.FC<CopyTextProps> = ({
  text,
  children,
  ellipsis,
  strong,
  secondary,
  className,
  style,
}) => {
  const value = text == null ? '' : String(text);
  const display = children ?? (value || '-');

  const handleCopy = useCallback(async (event: React.MouseEvent) => {
    event.stopPropagation();
    if (!value) {
      return;
    }
    try {
      await copyToClipboard(value);
      message.success('已复制到剪贴板');
    } catch {
      message.error('复制失败，请手动选择文本复制');
    }
  }, [value]);

  if (!value) {
    return <span className={className} style={style}>-</span>;
  }

  return (
    <span className={className} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', ...style }}>
      <Tooltip title={ellipsis ? value : undefined} mouseEnterDelay={0.4}>
        <Typography.Text
          strong={strong}
          type={secondary ? 'secondary' : undefined}
          ellipsis={ellipsis ? { tooltip: false } : undefined}
          style={{ marginBottom: 0, maxWidth: '100%' }}
        >
          {display}
        </Typography.Text>
      </Tooltip>
      <Tooltip title="复制">
        <Button
          type="text"
          size="small"
          aria-label="复制内容"
          icon={<CopyOutlined />}
          onClick={(event) => void handleCopy(event)}
          style={{ color: '#64748b', flex: '0 0 auto' }}
        />
      </Tooltip>
    </span>
  );
};

export default CopyText;
