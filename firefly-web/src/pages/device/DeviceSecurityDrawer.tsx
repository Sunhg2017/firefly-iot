import React, { useEffect, useState } from 'react';
import { Button, Drawer, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { deviceSecurityApi } from '../../services/api';
import { formatDateTime } from '../../utils/datetime';

interface DeviceCertificateRecord {
  id: number;
  serialNumber?: string;
  subjectDn?: string;
  fingerprintSha256: string;
  status: string;
  validFrom?: string;
  validTo?: string;
  createdAt?: string;
}

interface DeviceSecurityDrawerProps {
  deviceId: number | null;
  deviceName?: string;
  open: boolean;
  onClose: () => void;
}

const statusMeta: Record<string, { label: string; color: string }> = {
  ACTIVE: { label: '启用', color: 'success' },
  REVOKED: { label: '已吊销', color: 'default' },
};

const DeviceSecurityDrawer: React.FC<DeviceSecurityDrawerProps> = ({ deviceId, deviceName, open, onClose }) => {
  const [certificates, setCertificates] = useState<DeviceCertificateRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [pem, setPem] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sasToken, setSasToken] = useState<{ token: string; expiresAt: string } | null>(null);
  const [issuing, setIssuing] = useState(false);

  const loadCertificates = async () => {
    if (!deviceId) {
      return;
    }
    setLoading(true);
    try {
      const res = await deviceSecurityApi.listCertificates(deviceId);
      setCertificates((res.data.data || []) as DeviceCertificateRecord[]);
    } catch {
      setCertificates([]);
      message.error('加载设备证书失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSasToken(null);
      setPem('');
      void loadCertificates();
    }
  }, [open, deviceId]);

  const registerCertificate = async () => {
    if (!deviceId || !pem.trim()) {
      message.error('请粘贴证书 PEM 内容');
      return;
    }
    setSubmitting(true);
    try {
      await deviceSecurityApi.registerCertificate(deviceId, { certificatePem: pem.trim() });
      message.success('证书已登记');
      setRegisterOpen(false);
      setPem('');
      void loadCertificates();
    } catch {
      message.error('登记证书失败');
    } finally {
      setSubmitting(false);
    }
  };

  const revokeCertificate = (record: DeviceCertificateRecord) => {
    if (!deviceId) return;
    Modal.confirm({
      title: '确认吊销证书',
      content: '吊销后使用该指纹的设备将无法再通过 X.509 方式认证。',
      onOk: async () => {
        try {
          await deviceSecurityApi.revokeCertificate(deviceId, record.id);
          message.success('证书已吊销');
          void loadCertificates();
        } catch {
          message.error('吊销失败');
        }
      },
    });
  };

  const deleteCertificate = async (record: DeviceCertificateRecord) => {
    if (!deviceId) return;
    try {
      await deviceSecurityApi.deleteCertificate(deviceId, record.id);
      message.success('证书已删除');
      void loadCertificates();
    } catch {
      message.error('删除失败');
    }
  };

  const issueSasToken = async () => {
    if (!deviceId) return;
    setIssuing(true);
    try {
      const res = await deviceSecurityApi.issueSasToken(deviceId, 3600);
      setSasToken(res.data.data as { token: string; expiresAt: string });
      message.success('SAS 令牌已签发（有效期 1 小时，仅展示一次）');
    } catch {
      message.error('签发 SAS 令牌失败');
    } finally {
      setIssuing(false);
    }
  };

  const columns: ColumnsType<DeviceCertificateRecord> = [
    { title: '序列号', dataIndex: 'serialNumber', width: 140, render: (value?: string) => value || '-' },
    { title: '主体', dataIndex: 'subjectDn', ellipsis: true, render: (value?: string) => value || '-' },
    { title: '指纹', dataIndex: 'fingerprintSha256', ellipsis: true },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) => <Tag color={statusMeta[value]?.color}>{statusMeta[value]?.label || value}</Tag>,
    },
    { title: '有效期至', dataIndex: 'validTo', width: 160, render: (value?: string) => (value ? formatDateTime(value) : '-') },
    {
      title: '操作',
      width: 130,
      render: (_, record) => (
        <Space size="small">
          {record.status === 'ACTIVE' ? (
            <Button type="link" size="small" onClick={() => revokeCertificate(record)}>吊销</Button>
          ) : null}
          <Button type="link" size="small" danger onClick={() => void deleteCertificate(record)}>删除</Button>
        </Space>
      ),
    },
  ];

  return (
    <Drawer
      title={`安全凭证${deviceName ? ` · ${deviceName}` : ''}`}
      width={720}
      open={open}
      onClose={onClose}
      destroyOnClose
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={() => setRegisterOpen(true)}>登记 X.509 证书</Button>
        <Button loading={issuing} onClick={() => void issueSasToken()}>签发 SAS 令牌</Button>
      </Space>

      {sasToken ? (
        <div style={{ marginBottom: 16 }}>
          <Typography.Paragraph type="secondary" style={{ marginBottom: 4 }}>
            SAS 令牌（有效期至 {formatDateTime(sasToken.expiresAt)}，仅展示一次）
          </Typography.Paragraph>
          <Typography.Paragraph copyable={{ text: sasToken.token }} code style={{ wordBreak: 'break-all' }}>
            {sasToken.token}
          </Typography.Paragraph>
        </div>
      ) : null}

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={certificates}
        pagination={false}
        locale={{ emptyText: '暂无证书，X.509 认证方式需先登记证书指纹' }}
      />

      <Modal
        title="登记 X.509 证书"
        open={registerOpen}
        confirmLoading={submitting}
        onOk={() => void registerCertificate()}
        onCancel={() => setRegisterOpen(false)}
        width={640}
      >
        <Typography.Paragraph type="secondary">
          粘贴设备证书 PEM（-----BEGIN CERTIFICATE----- 开头）。平台计算 SHA-256 指纹，设备以该指纹作为接入凭据。
        </Typography.Paragraph>
        <Input.TextArea rows={12} value={pem} onChange={(event) => setPem(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
      </Modal>
    </Drawer>
  );
};

export default DeviceSecurityDrawer;
