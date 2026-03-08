import { useState } from 'react';
import {
  Button, Space, Typography, Input, InputNumber, Divider, message, Radio, Row, Col,
} from 'antd';
import { ApiOutlined, BugOutlined, EditOutlined, ReadOutlined } from '@ant-design/icons';
import { useSimStore } from '../../store';
import type { SimDevice } from '../../store';

const { Text } = Typography;

interface Props {
  device: SimDevice;
}

export default function ModbusControlPanel({ device }: Props) {
  const { addLog } = useSimStore();
  const [testing, setTesting] = useState(false);

  // Read state
  const [readFc, setReadFc] = useState<'FC01' | 'FC02' | 'FC03' | 'FC04'>('FC03');
  const [readAddr, setReadAddr] = useState(0);
  const [readCount, setReadCount] = useState(10);
  const [readResult, setReadResult] = useState('');
  const [reading, setReading] = useState(false);

  // Write state
  const [writeFc, setWriteFc] = useState<'FC05' | 'FC06' | 'FC15' | 'FC16'>('FC06');
  const [writeAddr, setWriteAddr] = useState(0);
  const [writeSingleValue, setWriteSingleValue] = useState(0);
  const [writeMultiValues, setWriteMultiValues] = useState('0,0,0');
  const [writing, setWriting] = useState(false);

  const target = {
    host: device.modbusHost,
    port: device.modbusPort,
    slaveId: device.modbusSlaveId,
    mode: device.modbusMode,
  };

  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await window.electronAPI.modbusTest(device.modbusConnectorUrl, target);
      if (res.success) {
        addLog(device.id, device.name, 'success', `Modbus 连接测试成功`);
        message.success('Modbus 连接测试成功');
      } else {
        addLog(device.id, device.name, 'error', `Modbus 测试失败: ${res.message || JSON.stringify(res.data)}`);
        message.error(`测试失败: ${res.message || '未知错误'}`);
      }
    } catch (err: any) {
      addLog(device.id, device.name, 'error', `Modbus 测试异常: ${err.message}`);
      message.error(err.message);
    }
    setTesting(false);
  };

  const handleRead = async () => {
    setReading(true);
    setReadResult('');
    try {
      const payload = { ...target, address: readAddr, quantity: readCount };
      let res: any;
      switch (readFc) {
        case 'FC01': res = await window.electronAPI.modbusReadCoils(device.modbusConnectorUrl, payload); break;
        case 'FC02': res = await window.electronAPI.modbusReadDiscreteInputs(device.modbusConnectorUrl, payload); break;
        case 'FC03': res = await window.electronAPI.modbusReadHoldingRegisters(device.modbusConnectorUrl, payload); break;
        case 'FC04': res = await window.electronAPI.modbusReadInputRegisters(device.modbusConnectorUrl, payload); break;
      }
      if (res.success) {
        const display = JSON.stringify(res.data, null, 2);
        setReadResult(display);
        addLog(device.id, device.name, 'info', `[${readFc}] 读取 addr=${readAddr} qty=${readCount} => ${JSON.stringify(res.data)}`);
      } else {
        setReadResult(`错误: ${res.message || JSON.stringify(res.data)}`);
        addLog(device.id, device.name, 'error', `[${readFc}] 读取失败: ${res.message}`);
      }
    } catch (err: any) {
      setReadResult(`异常: ${err.message}`);
      addLog(device.id, device.name, 'error', `[${readFc}] 异常: ${err.message}`);
    }
    setReading(false);
  };

  const handleWrite = async () => {
    setWriting(true);
    try {
      let res: any;
      const base = { ...target, address: writeAddr };
      switch (writeFc) {
        case 'FC05':
          res = await window.electronAPI.modbusWriteSingleCoil(device.modbusConnectorUrl, { ...base, value: writeSingleValue !== 0 });
          break;
        case 'FC06':
          res = await window.electronAPI.modbusWriteSingleRegister(device.modbusConnectorUrl, { ...base, value: writeSingleValue });
          break;
        case 'FC15': {
          const vals = writeMultiValues.split(',').map((v) => v.trim() !== '0');
          res = await window.electronAPI.modbusWriteMultipleCoils(device.modbusConnectorUrl, { ...base, values: vals });
          break;
        }
        case 'FC16': {
          const vals = writeMultiValues.split(',').map((v) => Number(v.trim()) || 0);
          res = await window.electronAPI.modbusWriteMultipleRegisters(device.modbusConnectorUrl, { ...base, values: vals });
          break;
        }
      }
      if (res.success) {
        addLog(device.id, device.name, 'success', `[${writeFc}] 写入 addr=${writeAddr} 成功`);
        message.success(`[${writeFc}] 写入成功`);
      } else {
        addLog(device.id, device.name, 'error', `[${writeFc}] 写入失败: ${res.message}`);
        message.error(`写入失败: ${res.message || '未知错误'}`);
      }
    } catch (err: any) {
      addLog(device.id, device.name, 'error', `[${writeFc}] 异常: ${err.message}`);
      message.error(err.message);
    }
    setWriting(false);
  };

  const isSingleWrite = writeFc === 'FC05' || writeFc === 'FC06';

  return (
    <div style={{ padding: '0 16px 16px' }}>
      <Divider orientation="left" style={{ margin: '8px 0', fontSize: 13, color: '#e0e0e0' }}>Modbus 控制</Divider>

      {/* Connection info */}
      <Space direction="vertical" size={4} style={{ width: '100%', marginBottom: 12 }}>
        <Text type="secondary" style={{ fontSize: 11 }}>
          Connector: <Text code style={{ fontSize: 11 }}>{device.modbusConnectorUrl}</Text>
        </Text>
        <Text type="secondary" style={{ fontSize: 11 }}>
          目标: <Text code style={{ fontSize: 11 }}>{device.modbusHost}:{device.modbusPort}</Text>{' '}
          Slave ID: <Text code style={{ fontSize: 11 }}>{device.modbusSlaveId}</Text>{' '}
          模式: <Text code style={{ fontSize: 11 }}>{device.modbusMode}</Text>
        </Text>
        <Button size="small" icon={<ApiOutlined />} onClick={handleTest} loading={testing}>
          连接测试
        </Button>
      </Space>

      {/* Read section */}
      <Divider orientation="left" style={{ margin: '8px 0', fontSize: 12 }}>
        <ReadOutlined /> 读取寄存器
      </Divider>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Radio.Group value={readFc} onChange={(e) => setReadFc(e.target.value)} size="small">
          <Radio.Button value="FC01">FC01 线圈</Radio.Button>
          <Radio.Button value="FC02">FC02 离散输入</Radio.Button>
          <Radio.Button value="FC03">FC03 保持寄存器</Radio.Button>
          <Radio.Button value="FC04">FC04 输入寄存器</Radio.Button>
        </Radio.Group>
        <Row gutter={8}>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>起始地址</Text>
            <InputNumber size="small" min={0} max={65535} value={readAddr} onChange={(v) => setReadAddr(v || 0)} style={{ width: '100%' }} />
          </Col>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>数量</Text>
            <InputNumber size="small" min={1} max={125} value={readCount} onChange={(v) => setReadCount(v || 1)} style={{ width: '100%' }} />
          </Col>
          <Col span={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
            <Button type="primary" size="small" icon={<BugOutlined />} onClick={handleRead} loading={reading} block>
              读取
            </Button>
          </Col>
        </Row>
        {readResult && (
          <pre style={{ background: '#1a1a2e', padding: 8, borderRadius: 4, fontSize: 11, color: '#a0e0a0', maxHeight: 200, overflow: 'auto', margin: 0, whiteSpace: 'pre-wrap' }}>
            {readResult}
          </pre>
        )}
      </Space>

      {/* Write section */}
      <Divider orientation="left" style={{ margin: '12px 0 8px', fontSize: 12 }}>
        <EditOutlined /> 写入寄存器
      </Divider>
      <Space direction="vertical" size={8} style={{ width: '100%' }}>
        <Radio.Group value={writeFc} onChange={(e) => setWriteFc(e.target.value)} size="small">
          <Radio.Button value="FC05">FC05 写单线圈</Radio.Button>
          <Radio.Button value="FC06">FC06 写单寄存器</Radio.Button>
          <Radio.Button value="FC15">FC15 写多线圈</Radio.Button>
          <Radio.Button value="FC16">FC16 写多寄存器</Radio.Button>
        </Radio.Group>
        <Row gutter={8}>
          <Col span={8}>
            <Text type="secondary" style={{ fontSize: 11 }}>起始地址</Text>
            <InputNumber size="small" min={0} max={65535} value={writeAddr} onChange={(v) => setWriteAddr(v || 0)} style={{ width: '100%' }} />
          </Col>
          <Col span={isSingleWrite ? 8 : 16}>
            {isSingleWrite ? (
              <>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {writeFc === 'FC05' ? '值 (0=OFF, 非0=ON)' : '值'}
                </Text>
                <InputNumber size="small" min={writeFc === 'FC05' ? 0 : -32768} max={writeFc === 'FC05' ? 1 : 65535}
                  value={writeSingleValue} onChange={(v) => setWriteSingleValue(v ?? 0)} style={{ width: '100%' }} />
              </>
            ) : (
              <>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {writeFc === 'FC15' ? '值 (逗号分隔, 0=OFF 1=ON)' : '值 (逗号分隔整数)'}
                </Text>
                <Input size="small" value={writeMultiValues} onChange={(e) => setWriteMultiValues(e.target.value)}
                  placeholder={writeFc === 'FC15' ? '1,0,1,1,0' : '100,200,300'} />
              </>
            )}
          </Col>
          {isSingleWrite && (
            <Col span={8} style={{ display: 'flex', alignItems: 'flex-end' }}>
              <Button type="primary" size="small" icon={<EditOutlined />} onClick={handleWrite} loading={writing} block>
                写入
              </Button>
            </Col>
          )}
        </Row>
        {!isSingleWrite && (
          <Button type="primary" size="small" icon={<EditOutlined />} onClick={handleWrite} loading={writing}>
            写入
          </Button>
        )}
      </Space>
    </div>
  );
}
