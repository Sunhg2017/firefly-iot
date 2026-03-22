import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { ConfigProvider, theme } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import App from './App';
import './styles/global.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ConfigProvider
      locale={zhCN}
      theme={{
        token: {
          colorPrimary: '#2563eb',
          colorSuccess: '#16a34a',
          colorWarning: '#d97706',
          colorError: '#dc2626',
          colorInfo: '#0ea5e9',
          borderRadius: 12,
          borderRadiusLG: 18,
          fontFamily: "'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontSize: 14,
          colorBgContainer: '#ffffff',
          colorBgLayout: '#edf2f7',
          colorBorder: '#dbe4ee',
          colorBorderSecondary: '#e8eef5',
          controlHeight: 38,
          boxShadowSecondary: '0 16px 32px rgba(15,23,42,0.08)',
        },
        components: {
          Button: {
            borderRadius: 12,
            controlHeight: 38,
            paddingContentHorizontal: 20,
          },
          Card: {
            borderRadiusLG: 18,
          },
          Input: {
            borderRadius: 12,
            controlHeight: 40,
          },
          Select: {
            borderRadius: 12,
            controlHeight: 40,
          },
          Table: {
            borderRadius: 18,
            headerBg: '#f6f9fc',
            headerColor: '#475569',
          },
          Menu: {
            itemBorderRadius: 12,
            subMenuItemBorderRadius: 12,
            itemHeight: 42,
          },
          Modal: {
            borderRadiusLG: 20,
          },
          Notification: {
            borderRadiusLG: 18,
          },
          Message: {
            borderRadiusLG: 12,
          },
          Drawer: {
            borderRadiusLG: 20,
          },
          Tabs: {
            inkBarColor: '#2563eb',
            itemActiveColor: '#2563eb',
            itemSelectedColor: '#2563eb',
          },
        },
        algorithm: theme.defaultAlgorithm,
      }}
    >
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ConfigProvider>
  </React.StrictMode>,
);
