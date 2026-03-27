import React, { useRef, useState } from 'react';
import {
  Button, Space, Tag, Typography, Empty,
  Modal, Form, Input, InputNumber, Radio, Row, Col, Statistic, message,
} from 'antd';
import {
  PlusOutlined, WifiOutlined, EditOutlined,
  ImportOutlined, ExportOutlined, DownloadOutlined, MinusCircleOutlined,
} from '@ant-design/icons';
import { useSimStore } from '../../store';
import type { SimDevice } from '../../store';

const { Text } = Typography;

interface SipMsg {
  dir: 'tx' | 'rx'; method: string; raw: string; ts: number;
}

interface Props {
  device: SimDevice;
  sipMessages: SipMsg[];
  setSipMessages: React.Dispatch<React.SetStateAction<SipMsg[]>>;
}

export type { SipMsg };

export default function SipControlPanel({ device, sipMessages, setSipMessages }: Props) {
  const { addLog, updateDevice } = useSimStore();
  const [sipLogOpen, setSipLogOpen] = useState(false);
  const [sipLogFilter, setSipLogFilter] = useState('');
  const [sipLogDir, setSipLogDir] = useState<'all' | 'tx' | 'rx'>('all');
  const [chEditOpen, setChEditOpen] = useState(false);
  const [chEditForm] = Form.useForm();
  const [chImportOpen, setChImportOpen] = useState(false);
  const [chImportText, setChImportText] = useState('');
  const [sipParamOpen, setSipParamOpen] = useState(false);
  const [sipParamForm] = Form.useForm();
  const sipLogRef = useRef<HTMLDivElement>(null);

  const isOnline = device.status === 'online';
  if (device.protocol !== 'Video' || device.streamMode !== 'GB28181' || !isOnline) return null;

  const chs = device.sipChannels.length > 0 ? device.sipChannels : [{
    channelId: device.gbDeviceId.slice(0, 14) + '131' + device.gbDeviceId.slice(17),
    name: `模拟通道-${device.name}`, manufacturer: 'Firefly-Simulator', model: 'VCam-1080P',
    status: 'ON' as const, ptzType: 1, longitude: 116.397, latitude: 39.909,
  }];

  return (
    <>
      <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space><WifiOutlined /><Text strong>GB28181 SIP 模拟</Text></Space>
          <Button type="link" size="small" icon={<EditOutlined />} style={{ fontSize: 11, padding: 0 }} onClick={() => {
            sipParamForm.setFieldsValue({
              sipServerIp: device.sipServerIp, sipServerPort: device.sipServerPort, sipServerId: device.sipServerId,
              sipLocalPort: device.sipLocalPort, sipKeepaliveInterval: device.sipKeepaliveInterval,
              sipTransport: device.sipTransport, sipPassword: device.sipPassword,
            });
            setSipParamOpen(true);
          }}>参数</Button>
        </div>
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <div style={{ padding: 8, background: 'rgba(255,255,255,0.04)', borderRadius: 6, fontSize: 12 }}>
            <Space direction="vertical" size={2}>
              <Text type="secondary">SIP Server: {device.sipServerIp}:{device.sipServerPort} ({device.sipTransport})</Text>
              <Text type="secondary">Server ID: {device.sipServerId}</Text>
              <Text type="secondary">本地端口: {device.sipLocalPort} | 鉴权: {device.sipPassword ? '已配置' : '未配置'} | 通道: {device.sipChannels.length || 1}</Text>
              <Text type="secondary">状态: {device.sipRegistered ?
                <Tag color="green" style={{ fontSize: 11 }}>已注册</Tag> :
                <Tag color="default" style={{ fontSize: 11 }}>未注册</Tag>}
              </Text>
            </Space>
          </div>
          <Space wrap>
            <Button
              size="small"
              type="primary"
              disabled={device.sipRegistered}
              onClick={async () => {
                if (!device.sipPassword?.trim()) {
                  addLog(device.id, device.name, 'error', 'SIP 注册失败：缺少设备级 SIP 密码');
                  return;
                }
                addLog(device.id, device.name, 'info', '启动 SIP 客户端...');
                const config = {
                  deviceId: device.gbDeviceId,
                  domain: device.gbDomain,
                  localIp: '127.0.0.1',
                  localPort: device.sipLocalPort,
                  serverIp: device.sipServerIp,
                  serverPort: device.sipServerPort,
                  serverId: device.sipServerId,
                  expires: 3600,
                  keepaliveInterval: device.sipKeepaliveInterval,
                  transport: device.sipTransport,
                  password: device.sipPassword,
                  manufacturer: 'Firefly-Simulator',
                  model: 'Virtual-Camera',
                  firmware: '1.0.0',
                  channels: device.sipChannels.length > 0 ? device.sipChannels : [{
                    channelId: device.gbDeviceId.slice(0, 14) + '131' + device.gbDeviceId.slice(17),
                    name: `模拟通道-${device.name}`,
                    manufacturer: 'Firefly-Simulator',
                    model: 'VCam-1080P',
                    status: 'ON' as const,
                    ptzType: 1,
                    longitude: 116.397428,
                    latitude: 39.90923,
                  }],
                };
                const startRes = await window.electronAPI.sipStart(device.id, config);
                if (!startRes.success) {
                  addLog(device.id, device.name, 'error', `SIP 启动失败: ${startRes.message}`);
                  return;
                }
                addLog(device.id, device.name, 'info', `SIP ${config.transport} 绑定 ${config.localIp}:${config.localPort}, 通道数: ${config.channels.length}`);
                const regRes = await window.electronAPI.sipRegister(device.id);
                if (!regRes.success) {
                  addLog(device.id, device.name, 'error', `SIP REGISTER 发送失败: ${regRes.message}`);
                }
              }}
            >
              SIP 注册
            </Button>
            <Button
              size="small"
              disabled={!device.sipRegistered}
              onClick={async () => {
                await window.electronAPI.sipStartKeepalive(device.id);
                addLog(device.id, device.name, 'info', `SIP 心跳已开启 (间隔 ${device.sipKeepaliveInterval}s)`);
              }}
            >
              开启心跳
            </Button>
            <Button
              size="small"
              onClick={async () => {
                await window.electronAPI.sipStopKeepalive(device.id);
                addLog(device.id, device.name, 'info', 'SIP 心跳已停止');
              }}
            >
              停止心跳
            </Button>
            <Button
              size="small"
              danger
              disabled={!device.sipRegistered}
              onClick={async () => {
                await window.electronAPI.sipStopKeepalive(device.id);
                await window.electronAPI.sipUnregister(device.id);
                updateDevice(device.id, { sipRegistered: false });
              }}
            >
              SIP 注销
            </Button>
            <Button
              size="small"
              danger
              ghost
              onClick={async () => {
                await window.electronAPI.sipStop(device.id);
                updateDevice(device.id, { sipRegistered: false });
                addLog(device.id, device.name, 'info', 'SIP 客户端已关闭');
              }}
            >
              关闭 SIP
            </Button>
          </Space>
          <Text type="secondary" style={{ fontSize: 11 }}>
            注册后平台可向此设备发送 Catalog 查询、INVITE 点播等 SIP 指令，模拟器会自动响应。
          </Text>
          {/* SIP Statistics Dashboard */}
          {sipMessages.length > 0 && (() => {
            const txCount = sipMessages.filter((m) => m.dir === 'tx').length;
            const rxCount = sipMessages.filter((m) => m.dir === 'rx').length;
            const methodMap: Record<string, number> = {};
            sipMessages.forEach((m) => {
              const key = m.method.split(' ')[0];
              methodMap[key] = (methodMap[key] || 0) + 1;
            });
            const topMethods = Object.entries(methodMap).sort((a, b) => b[1] - a[1]).slice(0, 6);
            return (
              <div style={{ padding: 8, background: 'rgba(255,255,255,0.03)', borderRadius: 6, marginTop: 2 }}>
                <Row gutter={8}>
                  <Col span={8}><Statistic title={<span style={{ fontSize: 10 }}>总报文</span>} value={sipMessages.length} valueStyle={{ fontSize: 18 }} /></Col>
                  <Col span={8}><Statistic title={<span style={{ fontSize: 10 }}>TX 发送</span>} value={txCount} valueStyle={{ fontSize: 18, color: '#91caff' }} /></Col>
                  <Col span={8}><Statistic title={<span style={{ fontSize: 10 }}>RX 接收</span>} value={rxCount} valueStyle={{ fontSize: 18, color: '#b7eb8f' }} /></Col>
                </Row>
                <div style={{ marginTop: 6 }}>
                  <Text type="secondary" style={{ fontSize: 10 }}>方法分布: </Text>
                  {topMethods.map(([method, count]) => (
                    <Tag key={method} style={{ fontSize: 10, margin: '2px 2px' }}>{method}: {count}</Tag>
                  ))}
                </div>
              </div>
            );
          })()}
          {/* Channel table */}
          <div style={{ marginTop: 4 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Text strong style={{ fontSize: 12 }}>通道列表 ({chs.length})</Text>
              <Space size={4}>
                <Button size="small" type="link" style={{ fontSize: 11, padding: 0 }} icon={<EditOutlined />} onClick={() => {
                  chEditForm.setFieldsValue({ sipChannels: device.sipChannels.length > 0 ? device.sipChannels : chs });
                  setChEditOpen(true);
                }}>编辑</Button>
                <Button size="small" type="link" style={{ fontSize: 11, padding: 0 }} icon={<ImportOutlined />} onClick={() => setChImportOpen(true)}>导入</Button>
                <Button size="small" type="link" style={{ fontSize: 11, padding: 0 }} icon={<ExportOutlined />} onClick={async () => {
                  const chsToExport = device.sipChannels.length > 0 ? device.sipChannels : chs;
                  await window.electronAPI.fileExport(JSON.stringify(chsToExport, null, 2), `sip-channels-${device.gbDeviceId}.json`);
                }}>导出</Button>
                <Button size="small" type="link" style={{ fontSize: 11, padding: 0 }} onClick={() => setSipLogOpen(true)}>SIP 报文 ({sipMessages.length})</Button>
              </Space>
            </div>
            <div style={{ marginTop: 4, overflowX: 'auto' }}>
              <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ textAlign: 'left', padding: '4px 6px', whiteSpace: 'nowrap' }}>通道 ID</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px', whiteSpace: 'nowrap' }}>名称</th>
                    <th style={{ textAlign: 'center', padding: '4px 6px' }}>状态</th>
                    <th style={{ textAlign: 'center', padding: '4px 6px' }}>PTZ</th>
                    <th style={{ textAlign: 'left', padding: '4px 6px' }}>厂商/型号</th>
                    <th style={{ textAlign: 'right', padding: '4px 6px' }}>经纬度</th>
                  </tr>
                </thead>
                <tbody>
                  {chs.map((ch, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: '3px 6px', fontFamily: 'monospace', fontSize: 10 }}>{ch.channelId}</td>
                      <td style={{ padding: '3px 6px' }}>{ch.name}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'center' }}>
                        <Tag color={ch.status === 'ON' ? 'green' : 'default'} style={{ fontSize: 10, margin: 0 }}>{ch.status}</Tag>
                      </td>
                      <td style={{ padding: '3px 6px', textAlign: 'center' }}>{['未知','球机','半球','固定'][ch.ptzType] || ch.ptzType}</td>
                      <td style={{ padding: '3px 6px', fontSize: 10 }}>{ch.manufacturer}/{ch.model}</td>
                      <td style={{ padding: '3px 6px', textAlign: 'right', fontFamily: 'monospace', fontSize: 10 }}>
                        {ch.longitude?.toFixed(3)}, {ch.latitude?.toFixed(3)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Space>
      </div>

      {/* Channel Edit Modal */}
      <Modal
        title="编辑 SIP 通道"
        open={chEditOpen}
        width={520}
        destroyOnHidden
        onCancel={() => setChEditOpen(false)}
        onOk={async () => {
          const vals = chEditForm.getFieldsValue();
          const channels = vals.sipChannels || [];
          updateDevice(device.id, { sipChannels: channels });
          await window.electronAPI.sipUpdateChannels(device.id, channels);
          addLog(device.id, device.name, 'info', `通道已更新 (${channels.length} 个通道)`);
          setChEditOpen(false);
        }}
      >
        <Form form={chEditForm} layout="vertical">
          <Form.List name="sipChannels">
            {(fields, { add, remove }) => (
              <>
                {fields.map(({ key, name, ...restField }) => (
                  <div key={key} style={{ marginBottom: 8, padding: 8, border: '1px solid rgba(255,255,255,0.06)', borderRadius: 6 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <Text style={{ fontSize: 12 }}>通道 #{name + 1}</Text>
                      <MinusCircleOutlined onClick={() => remove(name)} style={{ color: '#ff4d4f' }} />
                    </div>
                    <Row gutter={8}>
                      <Col span={16}>
                        <Form.Item {...restField} name={[name, 'channelId']} label="通道 ID" rules={[{ required: true }]} style={{ marginBottom: 6 }}>
                          <Input size="small" />
                        </Form.Item>
                      </Col>
                      <Col span={8}>
                        <Form.Item {...restField} name={[name, 'status']} label="状态" style={{ marginBottom: 6 }}>
                          <Radio.Group size="small">
                            <Radio.Button value="ON">在线</Radio.Button>
                            <Radio.Button value="OFF">离线</Radio.Button>
                          </Radio.Group>
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={8}>
                      <Col span={12}>
                        <Form.Item {...restField} name={[name, 'name']} label="名称" rules={[{ required: true }]} style={{ marginBottom: 6 }}>
                          <Input size="small" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item {...restField} name={[name, 'ptzType']} label="PTZ" style={{ marginBottom: 6 }}>
                          <InputNumber size="small" min={0} max={3} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={8}>
                      <Col span={12}>
                        <Form.Item {...restField} name={[name, 'manufacturer']} label="厂商" style={{ marginBottom: 6 }}>
                          <Input size="small" />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item {...restField} name={[name, 'model']} label="型号" style={{ marginBottom: 6 }}>
                          <Input size="small" />
                        </Form.Item>
                      </Col>
                    </Row>
                    <Row gutter={8}>
                      <Col span={12}>
                        <Form.Item {...restField} name={[name, 'longitude']} label="经度" style={{ marginBottom: 0 }}>
                          <InputNumber size="small" step={0.001} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                      <Col span={12}>
                        <Form.Item {...restField} name={[name, 'latitude']} label="纬度" style={{ marginBottom: 0 }}>
                          <InputNumber size="small" step={0.001} style={{ width: '100%' }} />
                        </Form.Item>
                      </Col>
                    </Row>
                  </div>
                ))}
                <Button type="dashed" onClick={() => {
                  const gbId = device?.gbDeviceId || '34020000001320000001';
                  const idx = fields.length + 1;
                  add({
                    channelId: gbId.slice(0, 14) + '131' + String(idx).padStart(3, '0'),
                    name: `通道${idx}`, manufacturer: 'Firefly-Simulator', model: 'VCam-1080P',
                    status: 'ON', ptzType: 1,
                    longitude: +(116.397 + Math.random() * 0.01).toFixed(6),
                    latitude: +(39.909 + Math.random() * 0.01).toFixed(6),
                  });
                }} icon={<PlusOutlined />} size="small" block>添加通道</Button>
              </>
            )}
          </Form.List>
        </Form>
      </Modal>

      {/* SIP Raw Message Log Modal */}
      <Modal
        title={`SIP 报文日志 (${sipMessages.length})`}
        open={sipLogOpen}
        width={720}
        footer={[
          <Button key="export" size="small" icon={<DownloadOutlined />} onClick={async () => {
            const filtered = sipMessages.filter((m) => {
              if (sipLogDir !== 'all' && m.dir !== sipLogDir) return false;
              if (sipLogFilter && !m.raw.toLowerCase().includes(sipLogFilter.toLowerCase()) && !m.method.toLowerCase().includes(sipLogFilter.toLowerCase())) return false;
              return true;
            });
            const text = filtered.map((m) => `[${new Date(m.ts).toISOString()}] [${m.dir.toUpperCase()}] ${m.method}\n${m.raw}`).join('\n\n---\n\n');
            await window.electronAPI.fileExport(text, `sip-messages-${Date.now()}.txt`);
          }}>导出</Button>,
          <Button key="copy" size="small" onClick={() => {
            const text = sipMessages.map((m) => `[${m.dir.toUpperCase()}] ${m.method}\n${m.raw}`).join('\n---\n');
            navigator.clipboard.writeText(text).then(() => message.success('已复制到剪贴板'));
          }}>复制全部</Button>,
          <Button key="clear" danger size="small" onClick={() => setSipMessages([])}>清空</Button>,
          <Button key="close" size="small" onClick={() => setSipLogOpen(false)}>关闭</Button>,
        ]}
        onCancel={() => setSipLogOpen(false)}
      >
        <Space style={{ marginBottom: 8, width: '100%' }} size={8}>
          <Input placeholder="搜索关键字..." size="small" allowClear style={{ width: 200 }} value={sipLogFilter} onChange={(e) => setSipLogFilter(e.target.value)} />
          <Radio.Group size="small" value={sipLogDir} onChange={(e) => setSipLogDir(e.target.value)}>
            <Radio.Button value="all">全部</Radio.Button>
            <Radio.Button value="tx">TX 发送</Radio.Button>
            <Radio.Button value="rx">RX 接收</Radio.Button>
          </Radio.Group>
        </Space>
        <div ref={sipLogRef} style={{ maxHeight: 420, overflow: 'auto', fontFamily: 'monospace', fontSize: 11, lineHeight: 1.5 }}>
          {(() => {
            const filtered = sipMessages.filter((m) => {
              if (sipLogDir !== 'all' && m.dir !== sipLogDir) return false;
              if (sipLogFilter && !m.raw.toLowerCase().includes(sipLogFilter.toLowerCase()) && !m.method.toLowerCase().includes(sipLogFilter.toLowerCase())) return false;
              return true;
            });
            if (filtered.length === 0) return <Empty description="暂无匹配的 SIP 报文" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
            return filtered.map((m, i) => (
              <div key={i} style={{ marginBottom: 8, borderBottom: '1px solid rgba(255,255,255,0.06)', paddingBottom: 6 }}>
                <div style={{ marginBottom: 2 }}>
                  <Tag color={m.dir === 'tx' ? 'blue' : 'green'} style={{ fontSize: 10 }}>{m.dir === 'tx' ? '→ TX' : '← RX'}</Tag>
                  <Text type="secondary" style={{ fontSize: 10 }}>{m.method}</Text>
                  <Text type="secondary" style={{ fontSize: 10, marginLeft: 8 }}>{new Date(m.ts).toLocaleTimeString()}</Text>
                  <Button type="link" size="small" style={{ fontSize: 10, padding: 0, marginLeft: 8, height: 'auto' }} onClick={() => {
                    navigator.clipboard.writeText(m.raw).then(() => message.success('已复制'));
                  }}>复制</Button>
                </div>
                <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all', color: m.dir === 'tx' ? '#91caff' : '#b7eb8f', fontSize: 10 }}>
                  {sipLogFilter ? m.raw.split(new RegExp(`(${sipLogFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi')).map((part, j) =>
                    part.toLowerCase() === sipLogFilter.toLowerCase() ? <mark key={j} style={{ background: '#faad14', color: '#000', padding: '0 1px' }}>{part}</mark> : part
                  ) : m.raw}
                </pre>
              </div>
            ));
          })()}
        </div>
      </Modal>

      {/* Channel Batch Import Modal */}
      <Modal
        title="批量导入通道"
        open={chImportOpen}
        width={520}
        onCancel={() => setChImportOpen(false)}
        onOk={() => {
          try {
            let channels: any[];
            const trimmed = chImportText.trim();
            if (trimmed.startsWith('[')) {
              channels = JSON.parse(trimmed);
            } else {
              channels = trimmed.split('\n').filter(Boolean).map((line) => {
                const parts = line.split(',').map((s) => s.trim());
                return {
                  channelId: parts[0] || '',
                  name: parts[1] || `通道`,
                  manufacturer: parts[2] || 'Firefly-Simulator',
                  model: parts[3] || 'VCam-1080P',
                  status: (parts[4] || 'ON') as 'ON' | 'OFF',
                  ptzType: parseInt(parts[5] || '1') || 1,
                  longitude: parseFloat(parts[6] || '116.397') || 116.397,
                  latitude: parseFloat(parts[7] || '39.909') || 39.909,
                };
              });
            }
            if (!Array.isArray(channels) || channels.length === 0) {
              message.error('解析失败：无有效通道数据');
              return;
            }
            const existing = device.sipChannels || [];
            const merged = [...existing, ...channels];
            updateDevice(device.id, { sipChannels: merged });
            window.electronAPI.sipUpdateChannels(device.id, merged);
            addLog(device.id, device.name, 'info', `批量导入 ${channels.length} 个通道，共 ${merged.length} 个`);
            message.success(`成功导入 ${channels.length} 个通道`);
            setChImportOpen(false);
            setChImportText('');
          } catch (err: any) {
            message.error(`解析失败: ${err.message}`);
          }
        }}
      >
        <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 8 }}>
          支持 JSON 数组或 CSV 格式（每行一个通道）：<br />
          <code style={{ fontSize: 11 }}>通道ID, 名称, 厂商, 型号, 状态, PTZ类型, 经度, 纬度</code>
        </Text>
        <Input.TextArea
          rows={8}
          placeholder={'JSON 示例:\n[\n  {"channelId":"34020000001310000001","name":"通道1","status":"ON","ptzType":1}\n]\n\nCSV 示例:\n34020000001310000001,通道1,Firefly-Simulator,VCam-1080P,ON,1,116.397,39.909'}
          value={chImportText}
          onChange={(e) => setChImportText(e.target.value)}
        />
      </Modal>

      {/* SIP Parameter Edit Modal */}
      <Modal
        title="编辑 SIP 参数"
        open={sipParamOpen}
        width={420}
        destroyOnHidden
        onCancel={() => setSipParamOpen(false)}
        onOk={async () => {
          const vals = await sipParamForm.validateFields();
          updateDevice(device.id, {
            sipServerIp: vals.sipServerIp,
            sipServerPort: vals.sipServerPort,
            sipServerId: vals.sipServerId,
            sipLocalPort: vals.sipLocalPort,
            sipKeepaliveInterval: vals.sipKeepaliveInterval,
            sipTransport: vals.sipTransport,
            sipPassword: vals.sipPassword,
          });
          addLog(device.id, device.name, 'info', 'SIP 参数已更新');
          if (device.sipRegistered) {
            message.warning('参数已保存。需要重新注册才能生效 — 请先注销再重新注册。');
          } else {
            message.success('SIP 参数已保存');
          }
          setSipParamOpen(false);
        }}
      >
        <Form form={sipParamForm} layout="vertical" size="small">
          <Row gutter={8}>
            <Col span={16}>
              <Form.Item name="sipServerIp" label="SIP Server IP" style={{ marginBottom: 8 }}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item name="sipServerPort" label="端口" style={{ marginBottom: 8 }}>
                <InputNumber min={1} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Form.Item name="sipServerId" label="Server ID" style={{ marginBottom: 8 }}>
            <Input />
          </Form.Item>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="sipLocalPort" label="本地端口" style={{ marginBottom: 8 }}>
                <InputNumber min={1024} max={65535} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item name="sipKeepaliveInterval" label="心跳间隔 (秒)" style={{ marginBottom: 8 }}>
                <InputNumber min={10} max={300} style={{ width: '100%' }} />
              </Form.Item>
            </Col>
          </Row>
          <Row gutter={8}>
            <Col span={12}>
              <Form.Item name="sipTransport" label="传输协议" style={{ marginBottom: 8 }}>
                <Radio.Group>
                  <Radio.Button value="UDP">UDP</Radio.Button>
                  <Radio.Button value="TCP">TCP</Radio.Button>
                </Radio.Group>
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item
                name="sipPassword"
                label="认证密码"
                rules={[{ required: true, message: '请输入 SIP 认证密码' }]}
                style={{ marginBottom: 0 }}
              >
                <Input.Password placeholder="请输入 SIP 认证密码" />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>
    </>
  );
}
