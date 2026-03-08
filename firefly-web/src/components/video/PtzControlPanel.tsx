import React from 'react';
import { Button, Slider, Space, Tooltip } from 'antd';
import {
  UpOutlined,
  DownOutlined,
  LeftOutlined,
  RightOutlined,
  ZoomInOutlined,
  ZoomOutOutlined,
  BorderOutlined,
} from '@ant-design/icons';

interface PtzControlPanelProps {
  onControl: (command: number, speed: number) => void;
  disabled?: boolean;
}

const PtzControlPanel: React.FC<PtzControlPanelProps> = ({ onControl, disabled = false }) => {
  const [speed, setSpeed] = React.useState(128);

  const btnStyle: React.CSSProperties = {
    width: 44,
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: 18,
  };

  const handleMouseDown = (command: number) => {
    onControl(command, speed);
  };

  const handleMouseUp = () => {
    onControl(0, 0); // STOP
  };

  return (
    <div style={{ padding: 12, background: '#1a1a2e', borderRadius: 12, display: 'inline-block' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '44px 44px 44px', gap: 4, justifyItems: 'center' }}>
        {/* Row 1: empty / UP / empty */}
        <div />
        <Tooltip title="上">
          <Button
            type="primary"
            shape="circle"
            icon={<UpOutlined />}
            style={btnStyle}
            disabled={disabled}
            onMouseDown={() => handleMouseDown(1)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </Tooltip>
        <div />

        {/* Row 2: LEFT / STOP / RIGHT */}
        <Tooltip title="左">
          <Button
            type="primary"
            shape="circle"
            icon={<LeftOutlined />}
            style={btnStyle}
            disabled={disabled}
            onMouseDown={() => handleMouseDown(3)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </Tooltip>
        <Tooltip title="停止">
          <Button
            shape="circle"
            icon={<BorderOutlined />}
            style={{ ...btnStyle, background: '#333', color: '#fff', border: 'none' }}
            disabled={disabled}
            onClick={() => onControl(0, 0)}
          />
        </Tooltip>
        <Tooltip title="右">
          <Button
            type="primary"
            shape="circle"
            icon={<RightOutlined />}
            style={btnStyle}
            disabled={disabled}
            onMouseDown={() => handleMouseDown(4)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </Tooltip>

        {/* Row 3: empty / DOWN / empty */}
        <div />
        <Tooltip title="下">
          <Button
            type="primary"
            shape="circle"
            icon={<DownOutlined />}
            style={btnStyle}
            disabled={disabled}
            onMouseDown={() => handleMouseDown(2)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </Tooltip>
        <div />
      </div>

      {/* Zoom controls */}
      <Space style={{ marginTop: 12, width: '100%', justifyContent: 'center' }}>
        <Tooltip title="缩小">
          <Button
            shape="circle"
            icon={<ZoomOutOutlined />}
            style={{ ...btnStyle, width: 36, height: 36, fontSize: 16 }}
            disabled={disabled}
            onMouseDown={() => handleMouseDown(6)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </Tooltip>
        <Tooltip title="放大">
          <Button
            shape="circle"
            icon={<ZoomInOutlined />}
            style={{ ...btnStyle, width: 36, height: 36, fontSize: 16 }}
            disabled={disabled}
            onMouseDown={() => handleMouseDown(5)}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
          />
        </Tooltip>
      </Space>

      {/* Speed slider */}
      <div style={{ marginTop: 8, padding: '0 4px' }}>
        <div style={{ color: '#aaa', fontSize: 12, textAlign: 'center', marginBottom: 2 }}>速度: {speed}</div>
        <Slider
          min={1}
          max={255}
          value={speed}
          onChange={(v: number) => setSpeed(v)}
          disabled={disabled}
          style={{ margin: 0 }}
        />
      </div>
    </div>
  );
};

export default PtzControlPanel;
