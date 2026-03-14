import React from 'react';
import { ApiOutlined, AppstoreOutlined, HddOutlined } from '@ant-design/icons';
import { Button, Card, Space, Tag, Typography } from 'antd';
import { useNavigate } from 'react-router-dom';

interface ProtocolAccessGuideProps {
  title: string;
  description: string;
  endpoint?: string;
  tips?: string[];
}

const ProtocolAccessGuide: React.FC<ProtocolAccessGuideProps> = ({
  title,
  description,
  endpoint,
  tips = [],
}) => {
  const navigate = useNavigate();

  return (
    <Card
      style={{
        marginBottom: 16,
        borderRadius: 16,
        border: '1px solid #dbeafe',
        background: 'linear-gradient(135deg, #f8fbff 0%, #eef6ff 100%)',
      }}
      styles={{ body: { padding: 20 } }}
    >
      <Space direction="vertical" size={12} style={{ width: '100%' }}>
        <Space wrap size={[8, 8]}>
          <Tag color="processing">协议接入</Tag>
          {endpoint ? <Tag>{endpoint}</Tag> : null}
        </Space>

        <div>
          <Typography.Title level={5} style={{ margin: 0, color: '#0f172a' }}>
            {title}
          </Typography.Title>
          <Typography.Paragraph style={{ margin: '8px 0 0', color: '#475569' }}>
            {description}
          </Typography.Paragraph>
        </div>

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

        {tips.length > 0 ? (
          <Space wrap size={[8, 8]}>
            {tips.map((tip) => (
              <Tag key={tip} color="blue">
                {tip}
              </Tag>
            ))}
          </Space>
        ) : null}
      </Space>
    </Card>
  );
};

export default ProtocolAccessGuide;
