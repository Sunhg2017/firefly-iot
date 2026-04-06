import { useState } from 'react';
import {
  Button, Space, Typography, Input, Divider, message,
} from 'antd';
import { ApiOutlined, BugOutlined } from '@ant-design/icons';
import { useSimStore } from '../../store';
import type { SimDevice } from '../../store';

const { Text } = Typography;

interface Props {
  device: SimDevice;
}

export default function SnmpControlPanel({ device }: Props) {
  const { addLog, adjustDeviceStats } = useSimStore();
  const [snmpOids, setSnmpOids] = useState('1.3.6.1.2.1.1.1.0');
  const [snmpGetResult, setSnmpGetResult] = useState<Record<string, string> | null>(null);
  const [snmpGetLoading, setSnmpGetLoading] = useState(false);
  const [snmpWalkOid, setSnmpWalkOid] = useState('1.3.6.1.2.1.1');
  const [snmpWalkResult, setSnmpWalkResult] = useState<Record<string, string> | null>(null);
  const [snmpWalkLoading, setSnmpWalkLoading] = useState(false);
  const [snmpSysInfo, setSnmpSysInfo] = useState<Record<string, string> | null>(null);
  const [snmpSysLoading, setSnmpSysLoading] = useState(false);

  const isOnline = device.status === 'online';
  if (device.protocol !== 'SNMP' || !isOnline) return null;

  const target = { host: device.snmpHost, port: device.snmpPort, version: device.snmpVersion, community: device.snmpCommunity };

  return (
    <div style={{ marginBottom: 16, padding: 12, background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
      <Space style={{ marginBottom: 8 }}><ApiOutlined /><Text strong>SNMP 控制面板</Text></Space>
      <Space direction="vertical" style={{ width: '100%' }} size={12}>
        {/* System Info */}
        <div>
          <Button size="small" icon={<BugOutlined />} loading={snmpSysLoading} onClick={async () => {
            setSnmpSysLoading(true);
            setSnmpSysInfo(null);
            const res = await window.electronAPI.snmpSystemInfo(device.snmpConnectorUrl, target);
            if (res.success && res.data?.data) {
              setSnmpSysInfo(res.data.data);
              addLog(device.id, device.name, 'success', `系统信息: ${JSON.stringify(res.data.data).slice(0, 120)}`);
              adjustDeviceStats(device.id, { sentCount: 1 });
            } else {
              addLog(device.id, device.name, 'error', `获取系统信息失败: ${res.data?.message || res.message || '未知错误'}`);
              adjustDeviceStats(device.id, { errorCount: 1 });
            }
            setSnmpSysLoading(false);
          }}>获取系统信息</Button>
          {snmpSysInfo && (
            <div style={{ marginTop: 8, padding: 8, background: '#0d1117', borderRadius: 6, maxHeight: 160, overflow: 'auto' }}>
              {Object.entries(snmpSysInfo).map(([k, v]) => (
                <div key={k} style={{ fontSize: 11, fontFamily: 'monospace', color: '#d4d4d4', padding: '1px 0' }}>
                  <Text style={{ color: '#79c0ff', fontSize: 11 }}>{k}</Text>: <Text style={{ color: '#d4d4d4', fontSize: 11 }}>{v}</Text>
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider style={{ margin: '4px 0' }} />

        {/* SNMP GET */}
        <div>
          <Text style={{ fontSize: 12 }} type="secondary">SNMP GET — OID（多个用逗号分隔）:</Text>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <Input size="small" value={snmpOids} onChange={(e) => setSnmpOids(e.target.value)}
              placeholder="1.3.6.1.2.1.1.1.0, 1.3.6.1.2.1.1.3.0" style={{ fontFamily: 'monospace', fontSize: 11, flex: 1 }} />
            <Button size="small" type="primary" loading={snmpGetLoading} onClick={async () => {
              if (!snmpOids.trim()) { message.warning('请输入 OID'); return; }
              setSnmpGetLoading(true);
              setSnmpGetResult(null);
              const oids = snmpOids.split(/[,;\n]+/).map((s: string) => s.trim()).filter(Boolean);
              const res = await window.electronAPI.snmpGet(device.snmpConnectorUrl, { target, oids });
              if (res.success && res.data?.data) {
                setSnmpGetResult(res.data.data);
                addLog(device.id, device.name, 'success', `GET ${oids.length} OIDs: ${JSON.stringify(res.data.data).slice(0, 120)}`);
                adjustDeviceStats(device.id, { sentCount: 1 });
              } else {
                addLog(device.id, device.name, 'error', `GET 失败: ${res.data?.message || res.message || '未知错误'}`);
                adjustDeviceStats(device.id, { errorCount: 1 });
              }
              setSnmpGetLoading(false);
            }}>GET</Button>
          </div>
          {snmpGetResult && (
            <div style={{ marginTop: 6, padding: 8, background: '#0d1117', borderRadius: 6, maxHeight: 200, overflow: 'auto' }}>
              {Object.entries(snmpGetResult).map(([oid, val]) => (
                <div key={oid} style={{ fontSize: 11, fontFamily: 'monospace', color: '#d4d4d4', padding: '1px 0' }}>
                  <Text style={{ color: '#79c0ff', fontSize: 11 }}>{oid}</Text> = <Text style={{ color: '#a5d6a7', fontSize: 11 }}>{val}</Text>
                </div>
              ))}
              {Object.keys(snmpGetResult).length === 0 && <Text type="secondary" style={{ fontSize: 11 }}>无返回数据</Text>}
            </div>
          )}
        </div>

        <Divider style={{ margin: '4px 0' }} />

        {/* SNMP WALK */}
        <div>
          <Text style={{ fontSize: 12 }} type="secondary">SNMP WALK — 根 OID:</Text>
          <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
            <Input size="small" value={snmpWalkOid} onChange={(e) => setSnmpWalkOid(e.target.value)}
              placeholder="1.3.6.1.2.1.1" style={{ fontFamily: 'monospace', fontSize: 11, flex: 1 }} />
            <Button size="small" type="primary" loading={snmpWalkLoading} onClick={async () => {
              if (!snmpWalkOid.trim()) { message.warning('请输入根 OID'); return; }
              setSnmpWalkLoading(true);
              setSnmpWalkResult(null);
              const res = await window.electronAPI.snmpWalk(device.snmpConnectorUrl, { target, rootOid: snmpWalkOid.trim() });
              if (res.success && res.data?.data) {
                setSnmpWalkResult(res.data.data);
                const count = Object.keys(res.data.data).length;
                addLog(device.id, device.name, 'success', `WALK ${snmpWalkOid}: ${count} 条结果`);
                adjustDeviceStats(device.id, { sentCount: 1 });
              } else {
                addLog(device.id, device.name, 'error', `WALK 失败: ${res.data?.message || res.message || '未知错误'}`);
                adjustDeviceStats(device.id, { errorCount: 1 });
              }
              setSnmpWalkLoading(false);
            }}>WALK</Button>
          </div>
          {snmpWalkResult && (
            <div style={{ marginTop: 6, padding: 8, background: '#0d1117', borderRadius: 6, maxHeight: 300, overflow: 'auto' }}>
              {Object.entries(snmpWalkResult).map(([oid, val]) => (
                <div key={oid} style={{ fontSize: 11, fontFamily: 'monospace', color: '#d4d4d4', padding: '1px 0' }}>
                  <Text style={{ color: '#79c0ff', fontSize: 11 }}>{oid}</Text> = <Text style={{ color: '#a5d6a7', fontSize: 11 }}>{val}</Text>
                </div>
              ))}
              <Text type="secondary" style={{ fontSize: 10, marginTop: 4, display: 'block' }}>共 {Object.keys(snmpWalkResult).length} 条</Text>
            </div>
          )}
        </div>
      </Space>
    </div>
  );
}
