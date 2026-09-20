import { Alert, Button, Card, Divider, Form, Input, Modal, Space, Tag, Typography, message } from 'antd';
import { useState } from 'react';
import { archiveRecord, createRevision, updateRecordContent } from '../api/emr';
import { readErrorMessage } from '../api/client';
import { REVISION_STATUS_LABEL } from '../constants/app';
import type { MedicalRecord, PatientTimeline, RevisionFormValues } from '../types/emr';

const { TextArea } = Input;
const { Text } = Typography;

interface RevisionCenterProps {
  timeline: PatientTimeline | null;
  onChanged: () => Promise<void>;
}

function RevisionForm({ form, disabled }: { form: ReturnType<typeof Form.useForm<RevisionFormValues>>[0]; disabled?: boolean }) {
  return (
    <Form form={form} layout="vertical" disabled={disabled} initialValues={{ doctor: '赵医生' }}>
      <Form.Item name="doctor" label="申请医生" rules={[{ required: true, message: '请输入申请医生' }]}>
        <Input placeholder="医生姓名" />
      </Form.Item>
      <Form.Item name="reason" label="修订原因" rules={[{ required: true, message: '修订原因不能为空' }]}>
        <TextArea rows={2} placeholder="例如：外院检查回报新证据，需补充诊断" />
      </Form.Item>
      <Form.Item name="chiefComplaint" label="新的主诉" rules={[{ required: true, message: '新主诉不能为空' }]}>
        <TextArea rows={2} />
      </Form.Item>
      <Form.Item name="diagnosis" label="新的诊断" rules={[{ required: true, message: '新诊断不能为空' }]}>
        <TextArea rows={2} />
      </Form.Item>
      <Form.Item name="treatment" label="新的治疗方案" rules={[{ required: true, message: '新治疗方案不能为空' }]}>
        <TextArea rows={2} />
      </Form.Item>
    </Form>
  );
}

export function RevisionCenter({ timeline, onChanged }: RevisionCenterProps) {
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [revisionForm] = Form.useForm<RevisionFormValues>();
  const [editForm] = Form.useForm<RevisionFormValues>();

  const current = timeline?.versions.find((item) => item.isCurrent);

  const openRevision = (record: MedicalRecord) => {
    revisionForm.setFieldsValue({
      doctor: record.doctor,
      reason: '',
      chiefComplaint: record.chiefComplaint,
      diagnosis: record.diagnosis,
      treatment: record.treatment,
    });
    setRevisionOpen(true);
  };

  const openEdit = (record: MedicalRecord) => {
    editForm.setFieldsValue({
      doctor: record.doctor,
      reason: '直接编辑',
      chiefComplaint: record.chiefComplaint,
      diagnosis: record.diagnosis,
      treatment: record.treatment,
    });
    setEditOpen(true);
  };

  const submitRevision = async () => {
    const values = await revisionForm.validateFields();
    setSubmitting(true);
    try {
      await createRevision(current!.id, values);
      message.success('修订申请已提交，等待管理员审批');
      setRevisionOpen(false);
      await onChanged();
    } catch (error) {
      message.error(readErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const submitEdit = async () => {
    const values = await editForm.validateFields();
    setSubmitting(true);
    try {
      await updateRecordContent(current!.id, values);
      message.success('病历内容已更新');
      setEditOpen(false);
      await onChanged();
    } catch (error) {
      message.error(readErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const archive = async () => {
    if (!current) return;
    try {
      await archiveRecord(current.id);
      message.success('病历已审签归档');
      await onChanged();
    } catch (error) {
      message.error(readErrorMessage(error));
    }
  };

  if (!timeline) {
    return <Card title="病历版本与修订闭环"><Text type="secondary">请先选择一位患者。</Text></Card>;
  }

  return (
    <Card title={`病历版本时间轴 · ${timeline.patient.name}`}>
      {current && (
        <Alert
          type={current.status === '已归档' ? 'warning' : 'info'}
          showIcon
          style={{ marginBottom: 12 }}
          message={
            current.status === '已归档'
              ? `当前版本 v${current.version} 已归档，禁止直接改动；可提交修订申请，批准后旧版自动留档。`
              : `当前版本 v${current.version} 尚未归档，可直接编辑或提交管理员审签。`
          }
          action={
            <Space direction="vertical">
              <Space>
                <Button size="small" onClick={() => openEdit(current)}>直接编辑</Button>
                <Button size="small" type="primary" ghost onClick={() => openRevision(current)}>申请修订</Button>
                {current.status !== '已归档' && (
                  <Button size="small" type="primary" onClick={archive}>审签归档</Button>
                )}
              </Space>
            </Space>
          }
        />
      )}

      {timeline.versions.map((record) => (
        <div key={record.id} style={{ padding: '8px 0', opacity: record.isCurrent ? 1 : 0.65 }}>
          <Space wrap>
            <Tag color={record.isCurrent ? 'blue' : 'default'}>v{record.version}</Tag>
            <Tag color={record.status === '已归档' ? 'green' : 'orange'}>{record.status}</Tag>
            {!record.isCurrent && <Tag>历史留档</Tag>}
            <Text type="secondary">{record.doctor} · {record.createdAt.replace('T', ' ').slice(0, 16)}</Text>
          </Space>
          <div><Text strong>主诉：</Text>{record.chiefComplaint}</div>
          <div><Text strong>诊断：</Text>{record.diagnosis}</div>
          <div><Text strong>治疗：</Text>{record.treatment}</div>
          <Divider style={{ margin: '8px 0' }} />
        </div>
      ))}

      <Typography.Title level={5}>修订申请与审批结果</Typography.Title>
      {timeline.revisions.length === 0 && <Text type="secondary">暂无修订申请。</Text>}
      {timeline.revisions.map((revision) => {
        const state = REVISION_STATUS_LABEL[revision.status] ?? { text: revision.status, color: 'default' };
        return (
          <Card key={revision.id} size="small" style={{ marginBottom: 8 }}>
            <Space wrap>
              <Tag color={state.color}>{state.text}</Tag>
              <Text>{revision.doctor}</Text>
              <Text type="secondary">{revision.createdAt.replace('T', ' ').slice(0, 16)}</Text>
            </Space>
            <div><Text strong>原因：</Text>{revision.reason}</div>
            <div><Text strong>拟修订为：</Text>{revision.diagnosis} / {revision.treatment}</div>
            {revision.reviewComment && (
              <div><Text strong>审批意见（{revision.reviewer ?? '管理员'}）：</Text>{revision.reviewComment}</div>
            )}
          </Card>
        );
      })}

      <Modal
        title="申请修订已归档病历"
        open={revisionOpen}
        onCancel={() => setRevisionOpen(false)}
        onOk={submitRevision}
        confirmLoading={submitting}
        okText="提交申请"
        destroyOnClose
      >
        <RevisionForm form={revisionForm} disabled={submitting} />
      </Modal>
      <Modal
        title="直接编辑病历（归档病历将被拒绝）"
        open={editOpen}
        onCancel={() => setEditOpen(false)}
        onOk={submitEdit}
        confirmLoading={submitting}
        okText="保存"
        destroyOnClose
      >
        <RevisionForm form={editForm} disabled={submitting} />
      </Modal>
    </Card>
  );
}
