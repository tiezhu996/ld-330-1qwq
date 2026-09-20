import { apiClient, setAuthToken } from './client';
import type { CurrentUser, MedicalRecord, Patient, RevisionRequest, Summary } from '../types/emr';

export const fetchSummary = async () => {
  const { data } = await apiClient.get<Summary>('/summary');
  return data;
};

export const searchPatients = async (keyword: string) => {
  const { data } = await apiClient.get<Patient[]>('/patients', { params: { keyword } });
  return data;
};

export const fetchTimeline = async (patientId: number) => {
  const { data } = await apiClient.get<MedicalRecord[]>(`/patients/${patientId}/timeline`);
  return data;
};

export const login = async (username: string, password: string) => {
  const { data } = await apiClient.post<{ token: string; user: CurrentUser }>('/auth/login', { username, password });
  setAuthToken(data.token);
  return data.user;
};

export const updateRecord = async (
  id: number,
  payload: { chiefComplaint: string; diagnosis: string; treatment: string },
) => {
  const { data } = await apiClient.put(`/records/${id}`, payload);
  return data;
};

export const submitRevision = async (
  recordId: number,
  payload: { reason: string; chiefComplaint: string; diagnosis: string; treatment: string },
) => {
  const { data } = await apiClient.post<RevisionRequest>(`/records/${recordId}/revision-requests`, payload);
  return data;
};

export const fetchPendingRevisions = async () => {
  const { data } = await apiClient.get<RevisionRequest[]>('/revision-requests/pending');
  return data;
};

export const approveRevision = async (id: number, comment: string) => {
  const { data } = await apiClient.post(`/revision-requests/${id}/approve`, { comment });
  return data;
};

export const rejectRevision = async (id: number, comment: string) => {
  const { data } = await apiClient.post(`/revision-requests/${id}/reject`, { comment });
  return data;
};

export const errorMessage = (error: unknown) => {
  const message = (error as { response?: { data?: { message?: string | string[] } } })?.response?.data?.message;
  if (Array.isArray(message)) {
    return message[0];
  }
  return message ?? '操作失败，请稍后重试';
};
