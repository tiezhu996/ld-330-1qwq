import { FileDoneOutlined, MedicineBoxOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Collapse, Form, Input, Layout, List, Row, Select, Space, Table, Tag, Timeline, Typography, message } from 'antd';
import { useEffect, useState } from 'react';
import { Editor, Toolbar } from '@wangeditor/editor-for-react';
import '@wangeditor/editor/dist/css/style.css';
import {
  approveRevision,
  errorMessage,
  fetchPendingRevisions,
  fetchSummary,
  fetchTimeline,
  login,
  rejectRevision,
  searchPatients,
  submitRevision,
  updateRecord,
} from '../api/emr';
import { APP_NAME, PRESCRIPTION_STATUS, RECORD_STATUS, REVISION_STATUS, ROLE_CREDENTIALS, ROLE_OPTIONS } from '../constants/app';
import { MetricCard } from '../components/MetricCard';
import { RevisionRequestModal, RevisionFormValues } from '../components/RevisionRequestModal';
import { RevisionReviewPanel } from '../components/RevisionReviewPanel';
import type { CurrentUser, MedicalRecord, Patient, RevisionRequest, Summary } from '../types/emr';

const { Header, Content } = Layout;

const REVISION_TAG_COLOR: Record<string, string> = {
  [REVISION_STATUS.pending]: 'gold',
  [REVISION_STATUS.approved]: 'green',
  [REVISION_STATUS.rejected]: 'red',
};

export function Dashboard() {
  const [summary, setSummary] = useState<Summary>({ patientCount: 0, recordCount: 0, prescriptionCount: 0, workload: [] });
  const [patients, setPatients] = useState<Patient[]>([]);
  const [timeline, setTimeline] = useState<MedicalRecord[]>([]);
  const [activePatientId, setActivePatientId] = useState<number>();
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [role, setRole] = useState('doctor');
  const [pendingRevisions, setPendingRevisions] = useState<RevisionRequest[]>([]);
  const [revisionTarget, setRevisionTarget] = useState<MedicalRecord | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [acting, setActing] = useState(false);
  const [editorHtml, setEditorHtml] = useState('<p>主诉：发热伴咳嗽。诊疗计划：完善血常规检查。</p>');
  const [messageApi, contextHolder] = message.useMessage();

  const showError = (error: unknown) => {
    messageApi.error(errorMessage(error));
  };

  const loadTimeline = async (patientId: number) => {
    setActivePatientId(patientId);
    setTimeline(await fetchTimeline(patientId));
  };

  const load = async () => {
    const [summaryData, patientData] = await Promise.all([fetchSummary(), searchPatients('')]);
    setSummary(summaryData);
    setPatients(patientData);
    if (patientData[0]) {
      await loadTimeline(patientData[0].id);
    }
  };

  const refreshPending = async (userRole?: string) => {
    if ((userRole ?? currentUser?.role) === 'admin') {
      setPendingRevisions(await fetchPendingRevisions());
    } else {
      setPendingRevisions([]);
    }
  };

  const handleRoleChange = async (nextRole: string) => {
    setRole(nextRole);
    try {
      const credentials = ROLE_CREDENTIALS[nextRole];
      const user = await login(credentials.username, credentials.password);
      setCurrentUser(user);
      await refreshPending(user.role);
    } catch (error) {
      showError(error);
    }
  };

  useEffect(() => {
    void load();
    void handleRoleChange('doctor');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const refreshAfterAction = async () => {
    const tasks: Promise<unknown>[] = [refreshPending()];
    if (activePatientId) {
      tasks.push(loadTimeline(activePatientId));
    }
    await Promise.all(tasks);
  };

  const handleSubmitRevision = async (values: RevisionFormValues) => {
    if (!revisionTarget) {
      return;
    }
    setSubmitting(true);
    try {
      await submitRevision(revisionTarget.id, values);
      messageApi.success('修订申请已提交，等待管理员审批');
      setModalOpen(false);
      setRevisionTarget(null);
      await refreshAfterAction();
    } catch (error) {
      showError(error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleApprove = async (id: number, comment: string) => {
    setActing(true);
    try {
      await approveRevision(id, comment);
      messageApi.success('已批准：新版本生效，旧版本已留档');
      await refreshAfterAction();
    } catch (error) {
      showError(error);
    } finally {
      setActing(false);
    }
  };

  const handleReject = async (id: number, comment: string) => {
    setActing(true);
    try {
      await rejectRevision(id, comment);
      messageApi.success('已驳回，原病历内容保持不变');
      await refreshAfterAction();
    } catch (error) {
      showError(error);
    } finally {
      setActing(false);
    }
  };

  const handleDirectEdit = async (record: MedicalRecord) => {
    try {
      await updateRecord(record.id, {
        chiefComplaint: record.chiefComplaint,
        diagnosis: record.diagnosis,
        treatment: record.treatment,
      });
      messageApi.success('病历已直接修改并留档');
      await refreshAfterAction();
    } catch (error) {
      showError(error);
    }
  };

  const hasOwnPending = (record: MedicalRecord) =>
    !!record.revisions?.some((item) => item.status === REVISION_STATUS.pending && item.doctor === currentUser?.name);

  return (
    <Layout className="app-shell">
      {contextHolder}
      <Header className="topbar">
        <Typography.Title level={3}>{APP_NAME}</Typography.Title>
        <Space>
          <Select value={role} options={ROLE_OPTIONS} onChange={(value) => void handleRoleChange(value)} />
          <Tag color="blue">{currentUser ? `${currentUser.name} · ${currentUser.role}` : '未登录'}</Tag>
        </Space>
      </Header>
      <Content className="content">
        <Alert
          type="info"
          showIcon
          message="已归档病历禁止直接改动：医生需提交修订申请，管理员批准后同一事务生成新版本并留档旧版，驳回则保留原文。"
        />
        <Row gutter={[16, 16]}>
          <Col xs={24} md={8}><MetricCard title="患者档案" value={summary.patientCount} icon={<TeamOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="病历数量" value={summary.recordCount} icon={<FileDoneOutlined />} /></Col>
          <Col xs={24} md={8}><MetricCard title="处方数量" value={summary.prescriptionCount} icon={<MedicineBoxOutlined />} /></Col>
        </Row>

        {currentUser?.role === 'admin' && (
          <Row gutter={[16, 16]}>
            <Col xs={24}>
              <RevisionReviewPanel
                requests={pendingRevisions}
                acting={acting}
                onApprove={(id, comment) => void handleApprove(id, comment)}
                onReject={(id, comment) => void handleReject(id, comment)}
              />
            </Col>
          </Row>
        )}

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="患者档案快速检索">
              <Form layout="inline" onFinish={(values) => searchPatients(values.keyword ?? '').then(setPatients)}>
                <Form.Item name="keyword"><Input.Search placeholder="姓名 / 身份证号 / 手机号" enterButton="检索" /></Form.Item>
              </Form>
              <Table
                rowKey="id"
                dataSource={patients}
                pagination={false}
                onRow={(record) => ({ onClick: () => void loadTimeline(record.id) })}
                columns={[
                  { title: '档案编号', dataIndex: 'recordNo' },
                  { title: '姓名', dataIndex: 'name' },
                  { title: '性别', dataIndex: 'gender' },
                  { title: '年龄', dataIndex: 'age' },
                  { title: '过敏史', dataIndex: 'allergies' },
                ]}
              />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="病历时间轴 · 版本与审批回读">
              <Timeline
                items={timeline.map((record) => ({
                  color: record.status === RECORD_STATUS.archived ? 'green' : 'blue',
                  children: (
                    <Space direction="vertical" style={{ width: '100%' }}>
                      <Space wrap>
                        <strong>{record.department} · {record.recordType}</strong>
                        <Tag>{record.status}</Tag>
                        <Tag color="purple">v{record.versionNo}</Tag>
                      </Space>
                      <span>主诉：{record.chiefComplaint}</span>
                      <span>诊断：{record.diagnosis}</span>
                      <span>治疗：{record.treatment}</span>
                      <Space wrap>
                        {record.status === RECORD_STATUS.archived && currentUser?.role === 'doctor' && (
                          hasOwnPending(record) ? (
                            <Tag color="gold">已有待处理申请</Tag>
                          ) : (
                            <Button
                              size="small"
                              type="primary"
                              onClick={() => {
                                setRevisionTarget(record);
                                setModalOpen(true);
                              }}
                            >
                              申请修订
                            </Button>
                          )
                        )}
                        <Button size="small" onClick={() => void handleDirectEdit(record)}>直接修改</Button>
                      </Space>
                      {!!record.versions?.length && (
                        <Collapse
                          size="small"
                          items={[{
                            key: 'versions',
                            label: `版本留档（${record.versions.length}）`,
                            children: (
                              <List
                                size="small"
                                dataSource={record.versions}
                                renderItem={(version) => (
                                  <List.Item>
                                    <Space direction="vertical" size={0}>
                                      <Space>
                                        <Tag color="geekblue">v{version.versionNo}</Tag>
                                        <span>{version.changeSource}</span>
                                      </Space>
                                      <Typography.Text type="secondary">
                                        {version.chiefComplaint} / {version.diagnosis} / {version.treatment}
                                      </Typography.Text>
                                    </Space>
                                  </List.Item>
                                )}
                              />
                            ),
                          }]}
                        />
                      )}
                      {!!record.revisions?.length && (
                        <List
                          size="small"
                          header="审批记录"
                          dataSource={record.revisions}
                          renderItem={(revision) => (
                            <List.Item>
                              <Space direction="vertical" size={0}>
                                <Space wrap>
                                  <Tag color={REVISION_TAG_COLOR[revision.status]}>{revision.status}</Tag>
                                  <span>{revision.doctor}：{revision.reason}</span>
                                </Space>
                                {revision.reviewComment && (
                                  <Typography.Text type="secondary">
                                    {revision.reviewer} 意见：{revision.reviewComment}
                                  </Typography.Text>
                                )}
                              </Space>
                            </List.Item>
                          )}
                        />
                      )}
                    </Space>
                  ),
                }))}
              />
            </Card>
          </Col>
        </Row>

        <Row gutter={[16, 16]}>
          <Col xs={24} lg={14}>
            <Card title="结构化病历模板与富文本书写">
              <Toolbar editor={null} defaultConfig={{}} mode="default" />
              <Editor defaultConfig={{ placeholder: '录入主诉、现病史、体格检查、诊断与治疗方案' }} value={editorHtml} onChange={(editor) => setEditorHtml(editor.getHtml())} mode="default" />
            </Card>
          </Col>
          <Col xs={24} lg={10}>
            <Card title="处方预览与状态跟踪">
              <List
                dataSource={[
                  { drug: '阿莫西林胶囊', spec: '0.25g*24粒', usage: '0.5g 口服 tid 5天' },
                  { drug: '布洛芬缓释胶囊', spec: '0.3g*20粒', usage: '0.3g 口服 bid 3天' },
                ]}
                renderItem={(item, index) => (
                  <List.Item actions={[<Tag color="gold">{PRESCRIPTION_STATUS[index]}</Tag>, <Button>打印</Button>]}>
                    <List.Item.Meta title={item.drug} description={`${item.spec} · ${item.usage}`} />
                  </List.Item>
                )}
              />
            </Card>
          </Col>
        </Row>
      </Content>
      <RevisionRequestModal
        record={revisionTarget}
        open={modalOpen}
        submitting={submitting}
        onCancel={() => {
          setModalOpen(false);
          setRevisionTarget(null);
        }}
        onSubmit={(values) => void handleSubmitRevision(values)}
      />
    </Layout>
  );
}
