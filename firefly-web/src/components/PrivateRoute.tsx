import React, { useEffect } from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Spin } from 'antd';
import useAuthStore from '../store/useAuthStore';

const PrivateRoute: React.FC = () => {
  const { isAuthenticated, user, loading, fetchMe } = useAuthStore();

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (loading || !user) {
    return <Spin size="large" fullscreen tip="加载中..." />;
  }

  return <Outlet />;
};

export default PrivateRoute;
