import React, { useEffect } from 'react';
import { Spin, Typography, message } from 'antd';
import { useNavigate } from 'react-router-dom';
import useAuthStore from '../../store/useAuthStore';
import { getUserHomePath } from '../../config/workspaceRoutes';
import { authApi, sessionApi } from '../../services/api';

const { Paragraph, Title } = Typography;

interface OauthCallbackPageProps {
  mode: 'login' | 'bind';
}

const OauthCallbackPage: React.FC<OauthCallbackPageProps> = ({ mode }) => {
  const navigate = useNavigate();

  useEffect(() => {
    const run = async () => {
      const searchParams = new URLSearchParams(window.location.search);
      const provider = searchParams.get('provider')?.trim().toUpperCase();
      const code = searchParams.get('code')?.trim();
      const state = searchParams.get('state')?.trim();
      const error = searchParams.get('error')?.trim();
      const errorDescription = searchParams.get('error_description')?.trim();

      if (error) {
        message.error(errorDescription || error);
        navigate(mode === 'bind' ? '/security?tab=oauth-binding' : '/login', { replace: true });
        return;
      }

      if (!provider || !code) {
        message.error('第三方回调缺少必要参数');
        navigate(mode === 'bind' ? '/security?tab=oauth-binding' : '/login', { replace: true });
        return;
      }

      try {
        if (mode === 'bind') {
          await sessionApi.createOauthBinding({ provider, code, state });
          message.success('第三方账号已绑定');
          navigate('/security?tab=oauth-binding', { replace: true });
          return;
        }

        const payload = { code, state, platform: 'WEB' };
        const res = provider === 'WECHAT'
          ? await authApi.wechatLogin(payload)
          : provider === 'DINGTALK'
            ? await authApi.dingtalkLogin(payload)
            : null;

        if (!res) {
          throw new Error(`当前控制台暂不支持 ${provider} 网页回调登录`);
        }

        const data = res.data?.data || {};
        const accessToken = data.accessToken as string | undefined;
        if (!accessToken) {
          throw new Error('第三方登录响应缺少 accessToken');
        }

        useAuthStore.getState().setAuth(
          accessToken,
          (data.refreshToken as string | undefined) || null,
          data.user,
        );
        const currentUser = useAuthStore.getState().user;
        navigate(getUserHomePath(currentUser), { replace: true });
      } catch (apiError) {
        message.error(apiError instanceof Error ? apiError.message : '第三方登录处理失败');
        navigate(mode === 'bind' ? '/security?tab=oauth-binding' : '/login', { replace: true });
      }
    };

    void run();
  }, [mode, navigate]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(180deg, #eef3f7 0%, #e6edf4 100%)',
      }}
    >
      <div style={{ textAlign: 'center' }}>
        <Spin size="large" />
        <Title level={4} style={{ marginTop: 24, marginBottom: 8 }}>
          {mode === 'bind' ? '正在完成第三方账号绑定' : '正在完成第三方登录'}
        </Title>
        <Paragraph style={{ marginBottom: 0, color: '#64748b' }}>
          请稍候，系统正在校验授权结果。
        </Paragraph>
      </div>
    </div>
  );
};

export default OauthCallbackPage;
