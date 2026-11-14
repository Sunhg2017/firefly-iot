import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Result, Space } from 'antd';
import { ArrowLeftOutlined } from '@ant-design/icons';
import useAuthStore from '../store/useAuthStore';
import { getUserHomePath } from '../config/workspaceRoutes';

const ForbiddenPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const homePath = useMemo(() => getUserHomePath(user), [user]);
  const canGoHome = homePath !== '/403';
  const canGoBack = window.history.length > 1;

  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '70vh' }}>
      <Result
        status="403"
        title="无访问权限"
        subTitle="当前账号没有访问该页面的权限。如果这是误判，请联系管理员为你的角色补充对应菜单与权限点。"
        extra={(
          <Space>
            {canGoBack ? (
              <Button size="large" icon={<ArrowLeftOutlined />} onClick={() => navigate(-1)}>
                返回上一页
              </Button>
            ) : null}
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
            >
              {canGoHome ? '返回首页' : '退出登录'}
            </Button>
          </Space>
        )}
      />
    </div>
  );
};

export default ForbiddenPage;
