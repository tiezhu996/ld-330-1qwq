import { Button, Card, Input, Modal, Space, Table, Tag, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { approveRevision, fetchRevisions, rejectRevision } from '../api/emr';
import { readErrorMessage } from '../api/client';
import { REVISION_STATUS_LABEL } from '../constants/app';
import type { RevisionRequest } from '../types/emr';

interface AdminRevisionQueueProps {
  reloadKey: number;
  onProcessed: () => Promise<void>;
}

export function AdminRevisionQueue({ reloadKey, onProcessed }: AdminRevisionQueueProps) {
  const [pending, setPending] = useState<RevisionRequest[]>([]);
  const [processed, setProcessed] = useState<RevisionRequest[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [rejectTarget, setRejectTarget] = useState<RevisionRequest | null>(null);
  const [comment, setComment] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [pendingList, doneList] = await Promise.all([
        fetchRevisions('待审批'),
        fetchRevisions(),
      ]);
      setPending(pendingList);
      setProcessed(doneList.filter((item) => item.status !== '待审批'));
    } catch (error) {
      message.error(readErrorMessage(error));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // reloadKey 变化（医生刚提交申请）时刷新队列。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reloadKey]);

  const approve = async (record: RevisionRequest) => {
    setBusyId(record.id);
    try {
      const result = await approveRevision(record.id);
      message.success(`已批准，生成 v${result.newVersion.version}，旧版已留档`);
      await Promise.all([load(), onProcessed()]);
    } catch (error) {
      // 并发批准时后到者会收到 409，提示即可，数据不会被改动。
      message.error(readErrorMessage(error, '审批失败，可能已被其他管理员处理'));
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const openReject = (record: RevisionRequest) => {
    setRejectTarget(record);
    setComment('');
  };

  const confirmReject = async () => {
    if (!rejectTarget || !comment.trim()) {
      message.warning('驳回必须填写审批意见');
      return;
    }
    setBusyId(rejectTarget.id);
    try {
      await rejectRevision(rejectTarget.id, comment.trim());
      message.success('已驳回，病历原文保持不变');
      setRejectTarget(null);
      await Promise.all([load(), onProcessed()]);
    } catch (error) {
      message.error(readErrorMessage(error));
    } finally {
      setBusyId(null);
    }
  };

  const columns = [
    { title: '申请', dataIndex: 'id', width: 70, render: (id: number) => `#${id}` },
    { title: '医生', dataIndex: 'doctor', width: 90 },
    { title: '修订原因', dataIndex: 'reason' },
    {
      title: '拟修订内容',
      render: (_: unknown, row: RevisionRequest) => (
        <Space direction="vertical" size={0}>
          <Typography.Text>主诉：{row.chiefComplaint}</Typography.Text>
          <Typography.Text>诊断：{row.diagnosis}</Typography.Text>
          <Typography.Text>治疗：{row.treatment}</Typography.Text>
        </Space>
      ),
    },
    {
      title: '操作',
      width: 180,
      render: (_: unknown, row: RevisionRequest) => (
        <Space>
          <Button type="primary" size="small" loading={busyId === row.id} onClick={() => approve(row)}>
            批准并生成新版本
          </Button>
          <Button danger size="small" disabled={busyId === row.id} onClick={() => openReject(row)}>
            驳回
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <Card title="管理员修订审批队列">
      <Table
        rowKey="id"
        size="small"
        loading={loading}
        dataSource={pending}
        pagination={false}
        locale={{ emptyText: '暂无待审批申请' }}
        columns={columns}
      />

      <Typography.Title level={5} style={{ marginTop: 16 }}>已处理申请</Typography.Title>
      <Table
        rowKey="id"
        size="small"
        dataSource={processed}
        pagination={false}
        locale={{ emptyText: '暂无已处理记录' }}
        columns={[
          { title: '申请', dataIndex: 'id', width: 70, render: (id: number) => `#${id}` },
          { title: '医生', dataIndex: 'doctor', width: 90 },
          {
            title: '结果',
            dataIndex: 'status',
            width: 180,
            render: (status: string) => {
              const state = REVISION_STATUS_LABEL[status] ?? { text: status, color: 'default' };
              return <Tag color={state.color}>{state.text}</Tag>;
            },
          },
          { title: '审批人', dataIndex: 'reviewer', width: 100 },
          { title: '审批意见', dataIndex: 'reviewComment', render: (value: string | null) => value ?? '—' },
        ]}
      />

      <Modal
        title={`驳回修订申请 #${rejectTarget?.id ?? ''}`}
        open={rejectTarget !== null}
        onCancel={() => setRejectTarget(null)}
        onOk={confirmReject}
        confirmLoading={busyId !== null}
        okText="确认驳回"
        okButtonProps={{ danger: true }}
      >
        <Typography.Paragraph type="secondary">驳回后病历原文保持不变，审批意见将随申请留痕。</Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder="请填写驳回意见（必填）"
        />
      </Modal>
    </Card>
  );
}
