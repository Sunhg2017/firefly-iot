import React from 'react';
import ReactDOM from 'react-dom/client';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './index.css';

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: 40, color: '#dc2626', background: '#f8fafc', height: '100vh', fontFamily: 'monospace' }}>
          <h2>应用运行错误</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#0f172a' }}>{this.state.error.message}</pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#64748b', fontSize: 12 }}>{this.state.error.stack}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, padding: '8px 16px', cursor: 'pointer' }}>
            重新加载
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <ConfigProvider
        locale={zhCN}
        theme={{
          algorithm: theme.defaultAlgorithm,
          token: {
            colorPrimary: '#4f46e5',
            colorBgBase: '#f4f8fc',
            colorBgContainer: '#ffffff',
            colorBgElevated: '#ffffff',
            colorFillAlter: '#f8fafc',
            colorBorder: '#dbe5f0',
            colorBorderSecondary: '#e6edf5',
            colorText: '#0f172a',
            colorTextSecondary: '#64748b',
            colorTextPlaceholder: '#94a3b8',
            boxShadowSecondary: '0 18px 42px rgba(15,23,42,0.08)',
            borderRadius: 10,
            fontSize: 13,
          },
          components: {
            Alert: {
              withDescriptionIconSize: 16,
            },
            Button: {
              primaryShadow: 'none',
              defaultShadow: 'none',
            },
            Input: {
              activeShadow: '0 0 0 2px rgba(79,70,229,0.12)',
            },
            Select: {
              optionSelectedBg: '#eef2ff',
            },
          },
        }}
      >
        <App />
      </ConfigProvider>
    </ErrorBoundary>
  </React.StrictMode>,
);
