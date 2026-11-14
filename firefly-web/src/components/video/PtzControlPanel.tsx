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

  // Keyboard activation has no "release" event, so send a short pulse instead of a continuous move.
  const handleKeyActivate = (command: number) => {
    onControl(command, speed);
    window.setTimeout(() => onControl(0, 0), 300);
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
            onPointerDown={() => handleMouseDown(1)}
            onPointerUp={handleMouseUp}
            onPointerLeave={handleMouseUp}
            onPointerCancel={handleMouseUp}
            onClick={(event) => { if (event.detail === 0) handleKeyActivate(1); }}
            aria-label="云台上转"
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
            onPointerDown={() => handleMouseDown(3)}
            onPointerUp={handleMouseUp}
            onPointerLeave={handleMouseUp}
            onPointerCancel={handleMouseUp}
            onClick={(event) => { if (event.detail === 0) handleKeyActivate(3); }}
            aria-label="云台左转"
          />
        </Tooltip>
        <Tooltip title="停止">
          <Button
            shape="circle"
            icon={<BorderOutlined />}
            style={{ ...btnStyle, background: '#333', color: '#fff', border: 'none' }}
            disabled={disabled}
            onClick={() => onControl(0, 0)}
            aria-label="停止转动"
          />
        </Tooltip>
        <Tooltip title="右">
          <Button
            type="primary"
            shape="circle"
            icon={<RightOutlined />}
            style={btnStyle}
            disabled={disabled}
            onPointerDown={() => handleMouseDown(4)}
            onPointerUp={handleMouseUp}
            onPointerLeave={handleMouseUp}
            onPointerCancel={handleMouseUp}
            onClick={(event) => { if (event.detail === 0) handleKeyActivate(4); }}
            aria-label="云台右转"
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
            onPointerDown={() => handleMouseDown(2)}
            onPointerUp={handleMouseUp}
            onPointerLeave={handleMouseUp}
            onPointerCancel={handleMouseUp}
            onClick={(event) => { if (event.detail === 0) handleKeyActivate(2); }}
            aria-label="云台下转"
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
            onPointerDown={() => handleMouseDown(6)}
            onPointerUp={handleMouseUp}
            onPointerLeave={handleMouseUp}
            onPointerCancel={handleMouseUp}
            onClick={(event) => { if (event.detail === 0) handleKeyActivate(6); }}
            aria-label="画面缩小"
          />
        </Tooltip>
        <Tooltip title="放大">
          <Button
            shape="circle"
            icon={<ZoomInOutlined />}
            style={{ ...btnStyle, width: 36, height: 36, fontSize: 16 }}
            disabled={disabled}
            onPointerDown={() => handleMouseDown(5)}
            onPointerUp={handleMouseUp}
            onPointerLeave={handleMouseUp}
            onPointerCancel={handleMouseUp}
            onClick={(event) => { if (event.detail === 0) handleKeyActivate(5); }}
            aria-label="画面放大"
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
