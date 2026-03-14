import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Result } from 'antd';
import useAuthStore from '../store/useAuthStore';
import { getWorkspaceHomePath, resolveWorkspaceByUserType } from '../config/workspaceRoutes';

const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const homePath = useMemo(
    () => getWorkspaceHomePath(
      resolveWorkspaceByUserType(user?.userType),
      Array.isArray(user?.permissions) ? user.permissions : [],
      Array.isArray(user?.authorizedMenuPaths) ? user.authorizedMenuPaths : [],
    ),
    [user?.authorizedMenuPaths, user?.permissions, user?.userType],
  );
  const canGoHome = homePath !== '/403';

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <Result
        status="403"
        title="403"
        subTitle="抱歉，您没有权限访问当前页面。"
        extra={(
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
            style={{ borderRadius: 10 }}
          >
            {canGoHome ? '返回首页' : '退出登录'}
          </Button>
        )}
      />
    </div>
  );
};

export default ForbiddenPage;
