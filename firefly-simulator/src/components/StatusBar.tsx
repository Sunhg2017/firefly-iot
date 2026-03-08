import { Typography } from 'antd';
import { useSimStore } from '../store';

const { Text } = Typography;

export default function StatusBar() {
  const { devices } = useSimStore();
  const online = devices.filter((d) => d.status === 'online').length;
  const error = devices.filter((d) => d.status === 'error').length;
  const totalSent = devices.reduce((a, d) => a + d.sentCount, 0);
  const totalErr = devices.reduce((a, d) => a + d.errorCount, 0);
  const byProto = { HTTP: 0, MQTT: 0, CoAP: 0, Video: 0, SNMP: 0, Modbus: 0, WebSocket: 0, TCP: 0, UDP: 0, LoRaWAN: 0 };
  devices.forEach((d) => { if (byProto[d.protocol as keyof typeof byProto] !== undefined) byProto[d.protocol as keyof typeof byProto]++; });
  return (
    <div style={{ height: 24, background: '#1a1a2e', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16, fontSize: 11, color: '#8c8c8c', flexShrink: 0 }}>
      <Text style={{ fontSize: 11, color: '#8c8c8c' }}>设备: <Text style={{ color: '#e0e0e0', fontSize: 11 }}>{devices.length}</Text></Text>
      <Text style={{ fontSize: 11, color: '#52c41a' }}>在线: {online}</Text>
      {error > 0 && <Text style={{ fontSize: 11, color: '#ff4d4f' }}>错误: {error}</Text>}
      <Text style={{ fontSize: 11, color: '#8c8c8c' }}>HTTP: {byProto.HTTP} / MQTT: {byProto.MQTT} / CoAP: {byProto.CoAP}{byProto.Video > 0 ? ` / Video: ${byProto.Video}` : ''}{byProto.SNMP > 0 ? ` / SNMP: ${byProto.SNMP}` : ''}{byProto.Modbus > 0 ? ` / Modbus: ${byProto.Modbus}` : ''}{byProto.WebSocket > 0 ? ` / WS: ${byProto.WebSocket}` : ''}{byProto.TCP > 0 ? ` / TCP: ${byProto.TCP}` : ''}{byProto.UDP > 0 ? ` / UDP: ${byProto.UDP}` : ''}{byProto.LoRaWAN > 0 ? ` / LoRa: ${byProto.LoRaWAN}` : ''}</Text>
      <div style={{ flex: 1 }} />
      <Text style={{ fontSize: 11, color: '#8c8c8c' }}>发送: {totalSent}</Text>
      {totalErr > 0 && <Text style={{ fontSize: 11, color: '#ff4d4f' }}>失败: {totalErr}</Text>}
      <Text style={{ fontSize: 10, color: '#595959' }}>Ctrl+N 添加 | Ctrl+Shift+C 全连 | Ctrl+Shift+D 全断</Text>
    </div>
  );
}
