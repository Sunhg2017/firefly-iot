import React from 'react';
import { Button, Result, Space, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

interface AppErrorBoundaryState {
  error: Error | null;
}

/**
 * Last line of defence: a render error must never leave the user with a blank page.
 * The fallback keeps the reset path obvious (retry in place, or reload the console).
 */
class AppErrorBoundary extends React.Component<React.PropsWithChildren, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // Keep the technical detail in the console for support; the UI stays actionable.
    console.error('[firefly-web] 页面渲染异常', error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  private handleReload = (): void => {
    window.location.reload();
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) {
      return this.props.children;
    }

    return (
      <div style={{ padding: 48 }}>
        <Result
          status="error"
          title="页面渲染失败"
          subTitle="当前页面遇到未知错误，可以尝试重新加载；若持续出现，请把下方错误信息提供给管理员。"
          extra={(
            <Space>
              <Button type="primary" onClick={this.handleRetry}>重试</Button>
              <Button icon={<ReloadOutlined />} onClick={this.handleReload}>重新加载控制台</Button>
            </Space>
          )}
        >
          <Typography.Paragraph style={{ marginBottom: 0 }}>
            <Typography.Text type="secondary" copyable={{ text: error.message }}>
              {error.message || '未知错误'}
            </Typography.Text>
          </Typography.Paragraph>
        </Result>
      </div>
    );
  }
}

export default AppErrorBoundary;
