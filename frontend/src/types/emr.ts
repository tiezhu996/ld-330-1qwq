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

export interface MedicalRecord {
  id: number;
  patientId: number;
  rootId: number;
  version: number;
  department: string;
  doctor: string;
  recordType: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  isCurrent: boolean;
  createdAt: string;
}

export interface RevisionRequest {
  id: number;
  recordId: number;
  patientId?: number;
  version?: number;
  doctor: string;
  reason: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  reviewer: string | null;
  reviewComment: string | null;
  createdAt: string;
  reviewedAt: string | null;
}

export interface PatientTimeline {
  patient: { id: number; name: string };
  versions: MedicalRecord[];
  revisions: RevisionRequest[];
}

export interface RevisionFormValues {
  doctor?: string;
  reason: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
}

export interface Summary {
  patientCount: number;
  recordCount: number;
  prescriptionCount: number;
  workload: Array<{ department: string; count: number }>;
}
