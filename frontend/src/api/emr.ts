import { apiClient } from './client';
import type {
  MedicalRecord,
  Patient,
  PatientTimeline,
  RevisionFormValues,
  RevisionRequest,
  Summary,
} from '../types/emr';

export const fetchSummary = async () => {
  const { data } = await apiClient.get<Summary>('/summary');
  return data;
};

export const searchPatients = async (keyword: string) => {
  const { data } = await apiClient.get<Patient[]>('/patients', { params: { keyword } });
  return data;
};

export const fetchTimeline = async (patientId: number) => {
  const { data } = await apiClient.get<PatientTimeline>(`/patients/${patientId}/timeline`);
  return data;
};

// 医生直接编辑未归档病历；归档病历会收到 409，引导改为提交修订申请。
export const updateRecordContent = async (recordId: number, values: RevisionFormValues) => {
  const { data } = await apiClient.patch<MedicalRecord>(`/records/${recordId}/content`, values);
  return data;
};

export const archiveRecord = async (recordId: number, reviewer = '系统管理员') => {
  const { data } = await apiClient.post(`/records/${recordId}/archive`, { reviewer });
  return data;
};

// 医生发起修订申请：原因 + 新的主诉/诊断/治疗方案。
export const createRevision = async (recordId: number, values: RevisionFormValues) => {
  const { data } = await apiClient.post<RevisionRequest>(`/records/${recordId}/revisions`, values);
  return data;
};

export const fetchRevisions = async (status?: string) => {
  const { data } = await apiClient.get<RevisionRequest[]>('/revisions', { params: { status } });
  return data;
};

export const approveRevision = async (revisionId: number, reviewer = '系统管理员') => {
  const { data } = await apiClient.post<{ request: number; newVersion: MedicalRecord }>(
    `/revisions/${revisionId}/approve`,
    { reviewer },
  );
  return data;
};

export const rejectRevision = async (revisionId: number, comment: string, reviewer = '系统管理员') => {
  const { data } = await apiClient.post<RevisionRequest>(`/revisions/${revisionId}/reject`, {
    reviewer,
    comment,
  });
  return data;
};
