import { Typography } from 'antd';
import { useSimStore } from '../store';

const { Text } = Typography;

export default function StatusBar() {
  const { devices } = useSimStore();
  const online = devices.filter((item) => item.status === 'online').length;
  const error = devices.filter((item) => item.status === 'error').length;
  const totalSent = devices.reduce((sum, item) => sum + item.sentCount, 0);
  const totalErr = devices.reduce((sum, item) => sum + item.errorCount, 0);
  const byProto = { HTTP: 0, MQTT: 0, CoAP: 0, Video: 0, SNMP: 0, Modbus: 0, WebSocket: 0, TCP: 0, UDP: 0, LoRaWAN: 0 };
  devices.forEach((item) => {
    if (byProto[item.protocol as keyof typeof byProto] !== undefined) {
      byProto[item.protocol as keyof typeof byProto] += 1;
    }
  });

  return (
    <div
      style={{
        marginLeft: 16,
        flexShrink: 0,
        minWidth: 420,
        display: 'flex',
        alignItems: 'center',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          width: '100%',
          padding: '10px 16px',
          borderRadius: 18,
          border: '1px solid rgba(148,163,184,0.16)',
          background: 'rgba(9, 14, 24, 0.72)',
          backdropFilter: 'blur(14px)',
          boxShadow: '0 10px 30px rgba(0,0,0,0.18)',
          color: '#94a3b8',
          fontSize: 11,
        }}
      >
        <Text style={{ fontSize: 11, color: '#cbd5e1' }}>
          设备 <Text style={{ color: '#f8fafc', fontSize: 11 }}>{devices.length}</Text>
        </Text>
        <Text style={{ fontSize: 11, color: '#4ade80' }}>在线 {online}</Text>
        {error > 0 ? <Text style={{ fontSize: 11, color: '#f87171' }}>异常 {error}</Text> : null}
        <Text style={{ fontSize: 11, color: '#94a3b8' }}>
          HTTP {byProto.HTTP} / MQTT {byProto.MQTT} / CoAP {byProto.CoAP}
          {byProto.Video > 0 ? ` / Video ${byProto.Video}` : ''}
          {byProto.SNMP > 0 ? ` / SNMP ${byProto.SNMP}` : ''}
          {byProto.Modbus > 0 ? ` / Modbus ${byProto.Modbus}` : ''}
          {byProto.WebSocket > 0 ? ` / WS ${byProto.WebSocket}` : ''}
          {byProto.TCP > 0 ? ` / TCP ${byProto.TCP}` : ''}
          {byProto.UDP > 0 ? ` / UDP ${byProto.UDP}` : ''}
          {byProto.LoRaWAN > 0 ? ` / LoRa ${byProto.LoRaWAN}` : ''}
        </Text>
        <div style={{ flex: 1 }} />
        <Text style={{ fontSize: 11, color: '#cbd5e1' }}>已发送 {totalSent}</Text>
        {totalErr > 0 ? <Text style={{ fontSize: 11, color: '#f87171' }}>失败 {totalErr}</Text> : null}
        <Text style={{ fontSize: 10, color: '#64748b' }}>Ctrl+N 新建 | Ctrl+Shift+C 全连 | Ctrl+Shift+D 全断</Text>
      </div>
    </div>
  );
}
