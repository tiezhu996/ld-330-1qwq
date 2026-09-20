import { Button, Card, Input, List, Space, Tag, Typography } from 'antd';
import { useState } from 'react';
import type { RevisionRequest } from '../types/emr';

interface RevisionReviewPanelProps {
  requests: RevisionRequest[];
  acting: boolean;
  onApprove: (id: number, comment: string) => void;
  onReject: (id: number, comment: string) => void;
}

export function RevisionReviewPanel({ requests, acting, onApprove, onReject }: RevisionReviewPanelProps) {
  const [comments, setComments] = useState<Record<number, string>>({});

  const setComment = (id: number, value: string) => {
    setComments((prev) => ({ ...prev, [id]: value }));
  };

  return (
    <Card title={`待审批修订申请（${requests.length}）`}>
      <List
        dataSource={requests}
        locale={{ emptyText: '暂无待处理申请' }}
        renderItem={(request) => (
          <List.Item
            actions={[
              <Button
                key="approve"
                type="primary"
                loading={acting}
                onClick={() => onApprove(request.id, comments[request.id] ?? '')}
              >
                批准
              </Button>,
              <Button
                key="reject"
                danger
                loading={acting}
                onClick={() => onReject(request.id, comments[request.id] ?? '')}
              >
                驳回
              </Button>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space wrap>
                  <Tag color="blue">病历 #{request.recordId}</Tag>
                  <span>{request.doctor}</span>
                  <Typography.Text type="secondary">原因：{request.reason}</Typography.Text>
                </Space>
              }
              description={
                <Space direction="vertical" size={4} style={{ width: '100%' }}>
                  <span>新主诉：{request.chiefComplaint}</span>
                  <span>新诊断：{request.diagnosis}</span>
                  <span>新治疗方案：{request.treatment}</span>
                  <Input.TextArea
                    rows={2}
                    placeholder="审批意见（驳回时必填）"
                    value={comments[request.id] ?? ''}
                    onChange={(event) => setComment(request.id, event.target.value)}
                  />
                </Space>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
}
