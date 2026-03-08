import { useRef, useState } from 'react';
import {
  Button, Space, Tag, Typography, Empty,
  Modal, Select, InputNumber, Tooltip,
  Card, Progress, Radio, message,
} from 'antd';
import {
  PlayCircleOutlined, PauseCircleOutlined,
} from '@ant-design/icons';
import { useSimStore, generatePayload } from '../store';

const { Text } = Typography;

type ScenarioStep = { type: 'connect' | 'disconnect' | 'send' | 'wait'; waitMs?: number; templateId?: string; topic?: string };

export default function ScenarioPanel() {
  const { devices, addLog, updateDevice, templates } = useSimStore();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [steps, setSteps] = useState<ScenarioStep[]>([
    { type: 'connect' },
    { type: 'wait', waitMs: 1000 },
    { type: 'send', templateId: 'tpl-temp-humidity', topic: '/sys/{productKey}/{deviceName}/thing/property/post' },
    { type: 'wait', waitMs: 2000 },
    { type: 'disconnect' },
  ]);
  const [loops, setLoops] = useState(1);
  const [targetProtocol, setTargetProtocol] = useState<string>('all');
  const [currentStep, setCurrentStep] = useState(-1);
  const [currentLoop, setCurrentLoop] = useState(0);
  const abortRef = useRef(false);

  const addStep = (type: ScenarioStep['type']) => {
    const s: ScenarioStep = { type };
    if (type === 'wait') s.waitMs = 1000;
    if (type === 'send') { s.templateId = templates[0]?.id || ''; s.topic = '/sys/{productKey}/{deviceName}/thing/property/post'; }
    setSteps((prev) => [...prev, s]);
  };

  const removeStep = (idx: number) => setSteps((prev) => prev.filter((_, i) => i !== idx));
  const moveStep = (idx: number, dir: -1 | 1) => {
    setSteps((prev) => {
      const n = [...prev];
      const t = idx + dir;
      if (t < 0 || t >= n.length) return n;
      [n[idx], n[t]] = [n[t], n[idx]];
      return n;
    });
  };

  const targetDevices = devices.filter((d) => targetProtocol === 'all' || d.protocol === targetProtocol);

  const runScenario = async () => {
    if (targetDevices.length === 0) { message.warning('没有匹配的设备'); return; }
    if (steps.length === 0) { message.warning('请添加至少一个步骤'); return; }
    setRunning(true);
    abortRef.current = false;
    addLog('system', '场景编排', 'info', `开始执行场景: ${steps.length} 步 × ${loops} 轮, ${targetDevices.length} 设备`);

    for (let loop = 0; loop < loops; loop++) {
      if (abortRef.current) break;
      setCurrentLoop(loop);
      for (let si = 0; si < steps.length; si++) {
        if (abortRef.current) break;
        setCurrentStep(si);
        const step = steps[si];

        if (step.type === 'connect') {
          const offlineDevs = targetDevices.filter((d) => d.status === 'offline');
          const { updateDevice: ud } = useSimStore.getState();
          for (const dev of offlineDevs) {
            if (abortRef.current) break;
            try {
              let res: any;
              if (dev.protocol === 'HTTP') {
                res = await window.electronAPI.httpAuth(dev.httpBaseUrl, dev.productKey, dev.deviceName, dev.deviceSecret);
                if (res.success && res.data?.token) ud(dev.id, { status: 'online', token: res.data.token });
              } else if (dev.protocol === 'CoAP') {
                res = await window.electronAPI.coapAuth(dev.coapBaseUrl, { productKey: dev.productKey, deviceName: dev.deviceName, deviceSecret: dev.deviceSecret });
                if (res.success && res.data?.token) ud(dev.id, { status: 'online', token: res.data.token });
              } else if (dev.protocol === 'MQTT') {
                res = await window.electronAPI.mqttConnect(dev.id, dev.mqttBrokerUrl, dev.mqttClientId, dev.mqttUsername, dev.mqttPassword, { clean: dev.mqttClean, keepalive: dev.mqttKeepalive || 60 });
                if (res.success) ud(dev.id, { status: 'online' });
              }
            } catch { /* skip */ }
          }
          addLog('system', '场景编排', 'info', `[轮${loop + 1}] 连接完成`);

        } else if (step.type === 'disconnect') {
          const onlineDevs = targetDevices.filter((d) => d.status === 'online');
          const { updateDevice: ud } = useSimStore.getState();
          for (const dev of onlineDevs) {
            if (dev.protocol === 'MQTT') await window.electronAPI.mqttDisconnect(dev.id);
            ud(dev.id, { status: 'offline', autoReport: false, autoTimerId: null });
          }
          addLog('system', '场景编排', 'info', `[轮${loop + 1}] 断开完成`);

        } else if (step.type === 'send') {
          const tpl = templates.find((t) => t.id === step.templateId);
          if (!tpl) continue;
          const onlineDevs = targetDevices.filter((d) => d.status === 'online');
          const promises = onlineDevs.map(async (dev) => {
            const payload = generatePayload(tpl.fields);
            try {
              if (dev.protocol === 'MQTT') {
                const topic = (step.topic || '').replace('{productKey}', dev.mqttUsername || 'product').replace('{deviceName}', dev.mqttClientId);
                await window.electronAPI.mqttPublish(dev.id, topic, JSON.stringify(payload), 1);
              } else if (dev.protocol === 'CoAP') {
                tpl.type === 'event' ? await window.electronAPI.coapReportEvent(dev.coapBaseUrl, dev.token, payload) : await window.electronAPI.coapReportProperty(dev.coapBaseUrl, dev.token, payload);
              } else {
                tpl.type === 'event' ? await window.electronAPI.httpReportEvent(dev.httpBaseUrl, dev.token, payload) : await window.electronAPI.httpReportProperty(dev.httpBaseUrl, dev.token, payload);
              }
              updateDevice(dev.id, { sentCount: dev.sentCount + 1 });
            } catch { updateDevice(dev.id, { errorCount: dev.errorCount + 1 }); }
          });
          await Promise.all(promises);
          addLog('system', '场景编排', 'info', `[轮${loop + 1}] 发送完成 (${onlineDevs.length} 设备)`);

        } else if (step.type === 'wait') {
          await new Promise((r) => setTimeout(r, step.waitMs || 1000));
        }
      }
    }
    setCurrentStep(-1);
    setCurrentLoop(0);
    setRunning(false);
    addLog('system', '场景编排', 'success', '场景执行完成');
    message.success('场景执行完成');
  };

  const stepLabel: Record<string, string> = { connect: '连接', disconnect: '断开', send: '发送数据', wait: '等待' };
  const stepColor: Record<string, string> = { connect: 'green', disconnect: 'red', send: 'blue', wait: 'default' };

  return (
    <>
      <Tooltip title="场景编排">
        <Button size="small" icon={<PlayCircleOutlined />} onClick={() => setOpen(true)} style={{ marginBottom: 8, marginLeft: 4 }} />
      </Tooltip>
      <Modal
        title={<Space><PlayCircleOutlined />场景编排</Space>}
        open={open}
        onCancel={() => !running && setOpen(false)}
        footer={null}
        width={580}
        maskClosable={!running}
      >
        <Space direction="vertical" style={{ width: '100%' }} size={12}>
          <Card size="small">
            <Space style={{ width: '100%', justifyContent: 'space-between' }}>
              <Space>
                <Text style={{ fontSize: 12 }}>目标设备:</Text>
                <Radio.Group value={targetProtocol} onChange={(e) => setTargetProtocol(e.target.value)} size="small" disabled={running}>
                  <Radio.Button value="all">全部 ({devices.length})</Radio.Button>
                  <Radio.Button value="HTTP">HTTP ({devices.filter(d=>d.protocol==='HTTP').length})</Radio.Button>
                  <Radio.Button value="MQTT">MQTT ({devices.filter(d=>d.protocol==='MQTT').length})</Radio.Button>
                  <Radio.Button value="CoAP">CoAP ({devices.filter(d=>d.protocol==='CoAP').length})</Radio.Button>
                </Radio.Group>
              </Space>
              <Space>
                <Text style={{ fontSize: 12 }}>循环:</Text>
                <InputNumber min={1} max={999} value={loops} onChange={(v) => setLoops(v || 1)} disabled={running} style={{ width: 70 }} size="small" />
                <Text type="secondary" style={{ fontSize: 11 }}>轮</Text>
              </Space>
            </Space>
          </Card>

          <Card size="small" title={<Text style={{ fontSize: 12 }}>步骤序列 ({steps.length})</Text>}
            extra={
              <Space size={4}>
                <Button size="small" type="link" onClick={() => addStep('connect')} disabled={running} style={{ fontSize: 11, padding: 0, color: '#52c41a' }}>+连接</Button>
                <Button size="small" type="link" onClick={() => addStep('send')} disabled={running} style={{ fontSize: 11, padding: 0, color: '#1890ff' }}>+发送</Button>
                <Button size="small" type="link" onClick={() => addStep('wait')} disabled={running} style={{ fontSize: 11, padding: 0 }}>+等待</Button>
                <Button size="small" type="link" onClick={() => addStep('disconnect')} disabled={running} style={{ fontSize: 11, padding: 0, color: '#ff4d4f' }}>+断开</Button>
              </Space>
            }
          >
            <div style={{ maxHeight: 240, overflow: 'auto' }}>
              {steps.length === 0 ? <Empty description="请添加步骤" image={Empty.PRESENTED_IMAGE_SIMPLE} /> : steps.map((s, i) => (
                <div key={i} style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '4px 6px', marginBottom: 4,
                  background: currentStep === i ? 'rgba(24,144,255,0.1)' : 'rgba(255,255,255,0.02)',
                  borderRadius: 4, borderLeft: currentStep === i ? '3px solid #1890ff' : '3px solid transparent',
                }}>
                  <Text type="secondary" style={{ fontSize: 10, width: 16 }}>{i + 1}</Text>
                  <Tag color={stepColor[s.type]} style={{ fontSize: 10, margin: 0 }}>{stepLabel[s.type]}</Tag>
                  {s.type === 'wait' && (
                    <InputNumber size="small" min={100} max={60000} value={s.waitMs} onChange={(v) => setSteps((prev) => prev.map((ss, ii) => ii === i ? { ...ss, waitMs: v || 1000 } : ss))} disabled={running} style={{ width: 80 }} addonAfter="ms" />
                  )}
                  {s.type === 'send' && (
                    <Select size="small" value={s.templateId} onChange={(v) => setSteps((prev) => prev.map((ss, ii) => ii === i ? { ...ss, templateId: v } : ss))} disabled={running} style={{ width: 140 }} options={templates.map((t) => ({ label: t.name, value: t.id }))} />
                  )}
                  <div style={{ flex: 1 }} />
                  <Button type="text" size="small" onClick={() => moveStep(i, -1)} disabled={running || i === 0} style={{ fontSize: 10, padding: '0 2px' }}>↑</Button>
                  <Button type="text" size="small" onClick={() => moveStep(i, 1)} disabled={running || i === steps.length - 1} style={{ fontSize: 10, padding: '0 2px' }}>↓</Button>
                  <Button type="text" size="small" danger onClick={() => removeStep(i)} disabled={running} style={{ fontSize: 10, padding: '0 2px' }}>×</Button>
                </div>
              ))}
            </div>
          </Card>

          {running && (
            <div style={{ fontSize: 11, padding: '4px 0' }}>
              <Text type="secondary">正在执行: 轮 {currentLoop + 1}/{loops}, 步骤 {currentStep + 1}/{steps.length}</Text>
              <Progress percent={Math.round(((currentLoop * steps.length + currentStep + 1) / (loops * steps.length)) * 100)} status="active" size="small" />
            </div>
          )}

          <Space>
            {!running ? (
              <Button type="primary" icon={<PlayCircleOutlined />} onClick={runScenario} disabled={steps.length === 0 || targetDevices.length === 0}>
                执行场景
              </Button>
            ) : (
              <Button danger icon={<PauseCircleOutlined />} onClick={() => { abortRef.current = true; }}>停止</Button>
            )}
            <Button size="small" onClick={() => { setSteps([]); }} disabled={running}>清空步骤</Button>
          </Space>
        </Space>
      </Modal>
    </>
  );
}
