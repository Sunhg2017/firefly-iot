import React, { useMemo } from 'react';
import { Card, Tabs } from 'antd';
import { useSearchParams } from 'react-router-dom';
import ApiKeyManagerTab from './ApiKeyManagerTab';
import OpenApiDocsTab from './OpenApiDocsTab';

type TabKey = 'appkey' | 'docs';

const normalizeTabKey = (value?: string | null): TabKey => (
  value === 'docs' ? 'docs' : 'appkey'
);

const ApiKeyPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeTab = useMemo(
    () => normalizeTabKey(searchParams.get('tab')),
    [searchParams],
  );

  const handleTabChange = (nextTab: string) => {
    const normalizedTab = normalizeTabKey(nextTab);
    const nextSearchParams = new URLSearchParams(searchParams);
    if (normalizedTab === 'appkey') {
      nextSearchParams.delete('tab');
    } else {
      nextSearchParams.set('tab', normalizedTab);
    }
    setSearchParams(nextSearchParams, { replace: true });
  };

  return (
    <Card bodyStyle={{ padding: 0 }} style={{ background: 'transparent', boxShadow: 'none' }}>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'appkey',
            label: 'AppKey 管理',
            children: (
              <div style={{ padding: 24 }}>
                <ApiKeyManagerTab />
              </div>
            ),
          },
          {
            key: 'docs',
            label: '接口文档',
            children: (
              <div style={{ padding: 24 }}>
                <OpenApiDocsTab />
              </div>
            ),
          },
        ]}
      />
    </Card>
  );
};

export default ApiKeyPage;
