import React, { useMemo } from 'react';
import { Tabs } from 'antd';
import { HddOutlined, VideoCameraOutlined } from '@ant-design/icons';
import { useSearchParams } from 'react-router-dom';
import DeviceList from './DeviceList';
import VideoList from '../video/VideoList';

type DeviceAssetTabKey = 'standard' | 'video';

const DevicePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = useMemo<DeviceAssetTabKey>(
    () => (searchParams.get('assetType') === 'video' ? 'video' : 'standard'),
    [searchParams],
  );

  const handleTabChange = (nextKey: string) => {
    const nextSearchParams = new URLSearchParams(searchParams);
    if (nextKey === 'video') {
      nextSearchParams.set('assetType', 'video');
    } else {
      nextSearchParams.delete('assetType');
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
            key: 'standard',
            label: (
              <span>
                <HddOutlined /> 设备
              </span>
            ),
          },
          {
            key: 'video',
            label: (
              <span>
                <VideoCameraOutlined /> 视频设备
              </span>
            ),
          },
        ]}
      />

      {activeTab === 'video' ? <VideoList embedded /> : <DeviceList />}
    </div>
  );
};

export default DevicePage;
