import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Result, Button } from 'antd';
import useAuthStore from '../store/useAuthStore';
import { getWorkspaceHomePath, resolveWorkspaceByUserType } from '../config/workspaceRoutes';

const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout, menuConfig } = useAuthStore();
  const homePath = useMemo(
    () => getWorkspaceHomePath(
      resolveWorkspaceByUserType(user?.userType),
      Array.isArray(user?.permissions) ? user.permissions : [],
      menuConfig,
    ),
    [user?.permissions, user?.userType, menuConfig],
  );
  const canGoHome = homePath !== '/403';

  return (
    <div className="animate-fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <Result
        status="403"
        title="403"
        subTitle="抱歉，您没有权限访问此页面。"
        extra={
          <Button
            type="primary"
            size="large"
            onClick={async () => {
              if (canGoHome) {
                navigate(homePath, { replace: true });
                return;
              }
              await logout();
              navigate('/login', { replace: true });
            }}
            style={{ borderRadius: 8 }}
          >
            {canGoHome ? '返回首页' : '退出登录'}
          </Button>
        }
      />
    </div>
  );
};

export default ForbiddenPage;
