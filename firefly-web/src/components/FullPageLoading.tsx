import React from 'react';
import { Spin } from 'antd';

interface FullPageLoadingProps {
  tip?: string;
}

/**
 * Branded full-page loading state. Used before the layout exists (session bootstrap,
 * lazy login page) so the transition does not flash an unstyled spinner.
 */
const FullPageLoading: React.FC<FullPageLoadingProps> = ({ tip = '正在加载控制台…' }) => (
  <div
    style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 20,
      background: 'linear-gradient(180deg, #eef3f7 0%, #e6edf4 100%)',
    }}
  >
    <div
      style={{
        width: 52,
        height: 52,
        borderRadius: 16,
        background: 'linear-gradient(180deg, #eff6ff 0%, #dbeafe 100%)',
        border: '1px solid #bfdbfe',
        color: '#2563eb',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 22,
        fontWeight: 800,
      }}
    >
      F
    </div>
    <Spin size="large" />
    <span style={{ color: '#475569', fontSize: 14 }}>{tip}</span>
  </div>
);

export default FullPageLoading;
