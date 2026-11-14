import React, { useEffect } from 'react';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { Button, Result } from 'antd';
import useAuthStore from '../store/useAuthStore';
import FullPageLoading from './FullPageLoading';

const PrivateRoute: React.FC = () => {
  const location = useLocation();
  const { isAuthenticated, user, loading, fetchMe, meError } = useAuthStore();

  useEffect(() => {
    void fetchMe();
  }, [fetchMe]);

  if (!isAuthenticated) {
    const redirect = `${location.pathname}${location.search}`;
    // Keep the deep link so re-login returns the user to the page they asked for.
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  if (loading || (!user && !meError)) {
    return <FullPageLoading tip="正在加载账号信息…" />;
  }

  if (!user) {
    return (
      <Result
        status="warning"
        title="账号信息加载失败"
        subTitle={meError || '暂时无法获取当前账号信息，请重试或重新登录。'}
        extra={(
          <Button type="primary" onClick={() => void fetchMe()}>
            重试
          </Button>
        )}
      />
    );
  }

  return <Outlet />;
};

export default PrivateRoute;
