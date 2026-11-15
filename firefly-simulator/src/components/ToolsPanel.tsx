import { Card, Col, Row, Space, Tag, Typography } from 'antd';
import {
  ApartmentOutlined, DatabaseOutlined, KeyOutlined, ThunderboltOutlined,
} from '@ant-design/icons';
import ScenarioPanel from './ScenarioPanel';
import TemplateEditorPanel from './TemplateEditorPanel';

const { Text, Title } = Typography;

const SHORTCUTS = [
  { keys: 'Ctrl / Cmd + N', action: '新建模拟设备' },
  { keys: 'Ctrl / Cmd + Shift + C', action: '批量连接当前可连接设备' },
  { keys: 'Ctrl / Cmd + Shift + D', action: '批量断开在线设备' },
];

export default function ToolsPanel() {
  return (
    <Space direction="vertical" size={16} style={{ width: '100%' }}>
      <Title level={4} style={{ margin: 0 }}>工具</Title>
      <Row gutter={16}>
        <Col span={12}>
          <Card
            style={{ borderRadius: 16, height: '100%' }}
            title={<Space><ApartmentOutlined />场景编排</Space>}
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Text type="secondary">
                按“连接 → 等待 → 发送 → 断开”编排一组设备动作，适合演示、回归和定时演练。
              </Text>
              <Space wrap>
                <Tag color="blue">连接</Tag>
                <Tag color="default">等待</Tag>
                <Tag color="green">发送</Tag>
                <Tag color="red">断开</Tag>
              </Space>
              <ScenarioPanel />
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card
            style={{ borderRadius: 16, height: '100%' }}
            title={<Space><DatabaseOutlined />数据模板</Space>}
          >
            <Space direction="vertical" size={12} style={{ width: '100%' }}>
              <Text type="secondary">
                维护温湿度、GPS、电表等上报模板；压测中心和场景编排都直接复用这些模板。
              </Text>
              <TemplateEditorPanel />
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card
            style={{ borderRadius: 16, height: '100%' }}
            title={<Space><ThunderboltOutlined />大批量压测建议</Space>}
          >
            <Space direction="vertical" size={8}>
              <Text>1. 在压测中心选择“批量创建设备”，HTTP/MQTT 优先使用动态注册。</Text>
              <Text>2. 并发 Worker 从 20 起，逐步增加；观察 P95 与失败原因。</Text>
              <Text>3. 先小规模验证模板和 Topic，再放大到上百台设备。</Text>
              <Text type="secondary">视频/GB28181 请在设备详情中单台联调，不参与批量压测。</Text>
            </Space>
          </Card>
        </Col>
        <Col span={12}>
          <Card
            style={{ borderRadius: 16, height: '100%' }}
            title={<Space><KeyOutlined />快捷键</Space>}
          >
            <Space direction="vertical" size={8}>
              {SHORTCUTS.map((item) => (
                <Space key={item.keys} style={{ justifyContent: 'space-between', width: '100%' }}>
                  <Tag style={{ fontFamily: 'monospace' }}>{item.keys}</Tag>
                  <Text type="secondary">{item.action}</Text>
                </Space>
              ))}
            </Space>
          </Card>
        </Col>
      </Row>
    </Space>
  );
}
