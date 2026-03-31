import React, { useEffect, useMemo, useState } from 'react';
import { Tabs } from 'antd';
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
  const [mountedTabs, setMountedTabs] = useState<TabKey[]>(() => [activeTab]);

  useEffect(() => {
    setMountedTabs((current) => (current.includes(activeTab) ? current : [...current, activeTab]));
  }, [activeTab]);

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
    <div>
      <Tabs
        activeKey={activeTab}
        onChange={handleTabChange}
        items={[
          {
            key: 'appkey',
            label: 'AppKey 管理',
          },
          {
            key: 'docs',
            label: '接口文档',
          },
        ]}
      />
      {/* Keep each tab mounted after first visit so filters/drawers are not reset when users switch views. */}
      {mountedTabs.includes('appkey') ? (
        <div style={{ display: activeTab === 'appkey' ? 'block' : 'none' }}>
          <ApiKeyManagerTab />
        </div>
      ) : null}
      {mountedTabs.includes('docs') ? (
        <div style={{ display: activeTab === 'docs' ? 'block' : 'none' }}>
          <OpenApiDocsTab />
        </div>
      ) : null}
    </div>
  );
};

export default ApiKeyPage;
