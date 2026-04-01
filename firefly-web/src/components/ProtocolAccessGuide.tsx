import React from 'react';
import { ApiOutlined, AppstoreOutlined, HddOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag } from 'antd';
import { useNavigate } from 'react-router-dom';

interface ProtocolAccessGuideProps {
  endpoint?: string;
}

const ProtocolAccessGuide: React.FC<ProtocolAccessGuideProps> = ({ endpoint }) => {
  const navigate = useNavigate();

  return (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 16,
      }}
      styles={{ body: { padding: 16 } }}
    >
      <Space wrap size={[12, 12]} style={{ width: '100%', justifyContent: 'space-between' }}>
        <Space wrap size={[8, 8]}>
          <Tag color="processing">相关入口</Tag>
          {endpoint ? <Tag>{endpoint}</Tag> : null}
        </Space>

        <Space wrap>
          <Button icon={<AppstoreOutlined />} onClick={() => navigate('/product')}>
            产品接入
          </Button>
          <Button icon={<ApiOutlined />} onClick={() => navigate('/protocol-parser')}>
            协议解析
          </Button>
          <Button icon={<HddOutlined />} onClick={() => navigate('/device')}>
            设备管理
          </Button>
        </Space>
      </Space>
    </Card>
  );
};

export default ProtocolAccessGuide;
