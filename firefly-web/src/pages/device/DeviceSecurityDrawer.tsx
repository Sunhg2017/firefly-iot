import React, { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Input, Modal, Popconfirm, Space, Table, Tag, Typography, message } from 'antd';
import type { ColumnsType } from 'antd/es/table';
import { deviceSecurityApi } from '../../services/api';
import CopyText from '../../components/CopyText';
import ListEmpty from '../../components/ListEmpty';
import { formatDateTime } from '../../utils/datetime';
import { getErrorMessage } from '../../utils/errors';

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
  ACTIVE: { label: '已启用', color: 'success' },
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
  const [pendingAction, setPendingAction] = useState<{ id: number; type: 'revoke' | 'delete' } | null>(null);

  const loadCertificates = async () => {
    if (!deviceId) {
      return;
    }
    setLoading(true);
    try {
      const res = await deviceSecurityApi.listCertificates(deviceId);
      setCertificates((res.data.data || []) as DeviceCertificateRecord[]);
    } catch (error) {
      setCertificates([]);
      message.error(getErrorMessage(error, '加载设备证书失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      setSasToken(null);
      setPem('');
      setRegisterOpen(false);
      setCertificates([]);
      void loadCertificates();
    }
  }, [open, deviceId]);

  const handleClose = () => {
    // SAS 令牌只在本次打开期间可见，关闭抽屉后立即丢弃。
    setSasToken(null);
    setRegisterOpen(false);
    setPem('');
    onClose();
  };

  const registerCertificate = async () => {
    if (!deviceId || submitting) {
      return;
    }
    if (!pem.trim()) {
      message.warning('请粘贴证书 PEM 内容');
      return;
    }
    setSubmitting(true);
    try {
      await deviceSecurityApi.registerCertificate(deviceId, { certificatePem: pem.trim() });
      message.success('证书已登记');
      setRegisterOpen(false);
      setPem('');
      void loadCertificates();
    } catch (error) {
      message.error(getErrorMessage(error, '登记证书失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const revokeCertificate = (record: DeviceCertificateRecord) => {
    if (!deviceId || pendingAction !== null) return;
    Modal.confirm({
      title: '确认吊销该证书？',
      content: '吊销后使用该指纹的设备将立即无法再通过 X.509 方式接入平台，且无法撤销吊销。',
      okText: '吊销',
      okButtonProps: { danger: true },
      onOk: async () => {
        setPendingAction({ id: record.id, type: 'revoke' });
        try {
          await deviceSecurityApi.revokeCertificate(deviceId, record.id);
          message.success('证书已吊销');
          void loadCertificates();
        } catch (error) {
          message.error(getErrorMessage(error, '吊销证书失败'));
        } finally {
          setPendingAction(null);
        }
      },
    });
  };

  const deleteCertificate = async (record: DeviceCertificateRecord) => {
    if (!deviceId || pendingAction !== null) return;
    setPendingAction({ id: record.id, type: 'delete' });
    try {
      await deviceSecurityApi.deleteCertificate(deviceId, record.id);
      message.success('证书已删除');
      void loadCertificates();
    } catch (error) {
      message.error(getErrorMessage(error, '删除证书失败'));
    } finally {
      setPendingAction(null);
    }
  };

  const issueSasToken = async () => {
    if (!deviceId || issuing) return;
    setIssuing(true);
    try {
      const res = await deviceSecurityApi.issueSasToken(deviceId, 3600);
      setSasToken(res.data.data as { token: string; expiresAt: string });
      message.success('SAS 令牌已签发（有效期 1 小时，仅展示一次）');
    } catch (error) {
      message.error(getErrorMessage(error, '签发 SAS 令牌失败'));
    } finally {
      setIssuing(false);
    }
  };

  const columns: ColumnsType<DeviceCertificateRecord> = [
    { title: '序列号', dataIndex: 'serialNumber', width: 150, render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
    { title: '主体', dataIndex: 'subjectDn', ellipsis: true, render: (value?: string) => (value ? <CopyText text={value} ellipsis /> : '-') },
    { title: '指纹', dataIndex: 'fingerprintSha256', ellipsis: true, render: (value: string) => <CopyText text={value} ellipsis /> },
    {
      title: '状态',
      dataIndex: 'status',
      width: 90,
      render: (value: string) => <Tag color={statusMeta[value]?.color}>{statusMeta[value]?.label || value}</Tag>,
    },
    { title: '有效期至', dataIndex: 'validTo', width: 170, render: (value?: string) => (value ? formatDateTime(value) : '-') },
    {
      title: '操作',
      width: 140,
      render: (_, record) => (
        <Space size={0}>
          {record.status === 'ACTIVE' ? (
            <Button
              type="link"
              size="small"
              loading={pendingAction?.id === record.id && pendingAction.type === 'revoke'}
              disabled={pendingAction !== null && pendingAction.id !== record.id}
              onClick={() => revokeCertificate(record)}
            >
              吊销
            </Button>
          ) : null}
          <Popconfirm
            title="确认删除该证书？"
            description="删除后该证书指纹将从设备上移除，使用该证书的设备将无法再通过 X.509 认证；此操作不可恢复。"
            okText="删除"
            okButtonProps={{ danger: true }}
            onConfirm={() => deleteCertificate(record)}
          >
            <Button
              type="link"
              size="small"
              danger
              loading={pendingAction?.id === record.id && pendingAction.type === 'delete'}
              disabled={pendingAction !== null && pendingAction.id !== record.id}
            >
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <Drawer
      title={`安全凭证${deviceName ? ` · ${deviceName}` : ''}`}
      width={760}
      open={open}
      onClose={handleClose}
      destroyOnClose
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Button type="primary" onClick={() => setRegisterOpen(true)}>登记 X.509 证书</Button>
        <Button loading={issuing} onClick={() => void issueSasToken()}>签发 SAS 令牌</Button>
      </Space>

      {sasToken ? (
        <Alert
          type="success"
          showIcon
          style={{ marginBottom: 16 }}
          message={`SAS 令牌（有效期至 ${formatDateTime(sasToken.expiresAt)}，仅展示一次）`}
          description={(
            <Space direction="vertical" size={4} style={{ width: '100%' }}>
              <CopyText text={sasToken.token}>
                <span style={{ wordBreak: 'break-all' }}>{sasToken.token}</span>
              </CopyText>
              <Typography.Text type="secondary">关闭抽屉后无法再次查看，请立即复制使用。</Typography.Text>
            </Space>
          )}
        />
      ) : null}

      <Table
        rowKey="id"
        size="small"
        loading={loading}
        columns={columns}
        dataSource={certificates}
        pagination={false}
        scroll={{ x: 700 }}
        locale={{ emptyText: <ListEmpty compact emptyText="暂无证书；使用 X.509 认证的设备需先登记证书" /> }}
      />

      <Modal
        title="登记 X.509 证书"
        open={registerOpen}
        confirmLoading={submitting}
        destroyOnHidden
        onOk={() => void registerCertificate()}
        onCancel={() => {
          setRegisterOpen(false);
          setPem('');
        }}
        okText="登记"
        width={640}
      >
        <Typography.Paragraph type="secondary">
          粘贴设备证书 PEM（以 -----BEGIN CERTIFICATE----- 开头）。平台会计算 SHA-256 指纹，设备使用该指纹作为接入凭据。
        </Typography.Paragraph>
        <Input.TextArea rows={12} value={pem} onChange={(event) => setPem(event.target.value)} placeholder="-----BEGIN CERTIFICATE-----" />
      </Modal>
    </Drawer>
  );
};

export default DeviceSecurityDrawer;
