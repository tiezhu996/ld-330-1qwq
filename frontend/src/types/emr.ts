export interface Patient {
  id: number;
  recordNo: string;
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies: string;
  history: string;
}

export interface RecordVersion {
  id: number;
  recordId: number;
  versionNo: number;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
  changeSource: string;
  createdAt: string;
}

export interface RevisionRequest {
  id: number;
  recordId: number;
  doctor: string;
  reason: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  reviewComment: string | null;
  reviewer: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface MedicalRecord {
  id: number;
  department: string;
  doctor: string;
  recordType: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  versionNo: number;
  createdAt: string;
  versions?: RecordVersion[];
  revisions?: RevisionRequest[];
}

export interface CurrentUser {
  username: string;
  role: string;
  name: string;
}

export interface Summary {
  patientCount: number;
  recordCount: number;
  prescriptionCount: number;
  workload: Array<{ department: string; count: number }>;
}
