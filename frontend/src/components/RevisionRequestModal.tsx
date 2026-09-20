import { Form, Input, Modal } from 'antd';
import type { MedicalRecord } from '../types/emr';

export interface RevisionFormValues {
  reason: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
}

interface RevisionRequestModalProps {
  record: MedicalRecord | null;
  open: boolean;
  submitting: boolean;
  onCancel: () => void;
  onSubmit: (values: RevisionFormValues) => void;
}

export function RevisionRequestModal({ record, open, submitting, onCancel, onSubmit }: RevisionRequestModalProps) {
  const [form] = Form.useForm<RevisionFormValues>();

  return (
    <Modal
      title={`归档修订申请 · 病历 #${record?.id ?? ''}（当前 v${record?.versionNo ?? 1}）`}
      open={open}
      confirmLoading={submitting}
      okText="提交申请"
      cancelText="取消"
      destroyOnClose
      onCancel={onCancel}
      onOk={() => form.validateFields().then(onSubmit)}
    >
      <Form
        key={record?.id ?? 'empty'}
        form={form}
        layout="vertical"
        initialValues={{
          chiefComplaint: record?.chiefComplaint,
          diagnosis: record?.diagnosis,
          treatment: record?.treatment,
        }}
      >
        <Form.Item name="reason" label="修订原因" rules={[{ required: true, message: '请填写修订原因' }]}>
          <Input.TextArea rows={2} placeholder="说明为何需要修订该已归档病历" />
        </Form.Item>
        <Form.Item name="chiefComplaint" label="新主诉" rules={[{ required: true, message: '请填写新的主诉' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="diagnosis" label="新诊断" rules={[{ required: true, message: '请填写新的诊断' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
        <Form.Item name="treatment" label="新治疗方案" rules={[{ required: true, message: '请填写新的治疗方案' }]}>
          <Input.TextArea rows={2} />
        </Form.Item>
      </Form>
    </Modal>
  );
}
