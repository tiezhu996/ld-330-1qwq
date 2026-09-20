import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, RECORD_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';

export interface CreatePatientDto {
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies?: string;
  history?: string;
}

export interface UpdateRecordDto {
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
}

@Injectable()
export class RecordsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async summary() {
    const [patients, records, prescriptions, workload] = await Promise.all([
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM patients'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM medical_records'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM prescriptions'),
      this.database.query<{ department: string; count: string }>(
        'SELECT department, COUNT(*) FROM medical_records GROUP BY department ORDER BY count DESC',
      ),
    ]);
    return {
      patientCount: Number(patients.rows[0].count),
      recordCount: Number(records.rows[0].count),
      prescriptionCount: Number(prescriptions.rows[0].count),
      workload: workload.rows.map((item) => ({ department: item.department, count: Number(item.count) })),
    };
  }

  async searchPatients(keyword = '') {
    const like = `%${keyword}%`;
    const result = await this.database.query(
      `SELECT id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history, created_at AS "createdAt"
       FROM patients
       WHERE name ILIKE $1 OR id_card ILIKE $1 OR phone ILIKE $1
       ORDER BY created_at DESC`,
      [like],
    );
    return result.rows;
  }

  async createPatient(dto: CreatePatientDto) {
    const recordNo = `EMR${Date.now().toString().slice(-9)}`;
    const result = await this.database.query(
      `INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, record_no AS "recordNo", name, gender, age, id_card AS "idCard", phone, allergies, history`,
      [recordNo, dto.name, dto.gender, dto.age, dto.idCard, dto.phone, dto.allergies ?? '', dto.history ?? ''],
    );
    await this.audit.log('doctor', '创建患者档案', recordNo);
    return result.rows[0];
  }

  async timeline(patientId: number) {
    const patient = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const records = await this.database.query<{ id: number }>(
      `SELECT id, department, doctor, record_type AS "recordType", chief_complaint AS "chiefComplaint",
              diagnosis, treatment, status, version_no AS "versionNo", created_at AS "createdAt"
       FROM medical_records WHERE patient_id = $1 ORDER BY created_at DESC`,
      [patientId],
    );
    const ids = records.rows.map((row) => row.id);
    if (!ids.length) {
      return [];
    }
    const [versions, revisions] = await Promise.all([
      this.database.query(
        `SELECT id, record_id AS "recordId", version_no AS "versionNo", chief_complaint AS "chiefComplaint",
                diagnosis, treatment, change_source AS "changeSource", created_at AS "createdAt"
         FROM record_versions WHERE record_id = ANY($1::int[]) ORDER BY version_no DESC`,
        [ids],
      ),
      this.database.query(
        `SELECT id, record_id AS "recordId", doctor, reason, chief_complaint AS "chiefComplaint", diagnosis, treatment,
                status, review_comment AS "reviewComment", reviewer, created_at AS "createdAt", reviewed_at AS "reviewedAt"
         FROM revision_requests WHERE record_id = ANY($1::int[]) ORDER BY created_at DESC`,
        [ids],
      ),
    ]);
    return records.rows.map((record) => ({
      ...record,
      versions: versions.rows.filter((version) => version.recordId === record.id),
      revisions: revisions.rows.filter((revision) => revision.recordId === record.id),
    }));
  }

  async createRecord(patientId: number) {
    return this.database.withTransaction(async (client) => {
      const result = await client.query(
        `INSERT INTO medical_records
         (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status, version_no)
         VALUES ($1, '心内科', '赵医生', '门诊', '胸闷待查', '冠心病风险评估', '完善心电图与血脂检查', $2, 1)
         RETURNING id, status`,
        [patientId, RECORD_STATUS.pendingReview],
      );
      const recordId = result.rows[0].id as number;
      await client.query(
        `INSERT INTO record_versions (record_id, version_no, chief_complaint, diagnosis, treatment, change_source)
         VALUES ($1, 1, '胸闷待查', '冠心病风险评估', '完善心电图与血脂检查', '建档')`,
        [recordId],
      );
      await this.audit.log('doctor', '创建结构化病历', `record:${recordId}`, client);
      return result.rows[0];
    });
  }

  async updateRecord(id: number, dto: UpdateRecordDto, actor: string) {
    const existing = await this.database.query<{ status: string }>(
      'SELECT status FROM medical_records WHERE id = $1',
      [id],
    );
    if (!existing.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    if (existing.rows[0].status === RECORD_STATUS.archived) {
      throw new ForbiddenException(APP_MESSAGES.recordArchived);
    }
    return this.database.withTransaction(async (client) => {
      const current = await client.query(
        `SELECT version_no AS "versionNo", chief_complaint AS "chiefComplaint", diagnosis, treatment
         FROM medical_records WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const oldVersion = current.rows[0];
      await client.query(
        `INSERT INTO record_versions (record_id, version_no, chief_complaint, diagnosis, treatment, change_source)
         VALUES ($1, $2, $3, $4, $5, '修改前留档')
         ON CONFLICT (record_id, version_no) DO NOTHING`,
        [id, oldVersion.versionNo, oldVersion.chiefComplaint, oldVersion.diagnosis, oldVersion.treatment],
      );
      const nextVersion = Number(oldVersion.versionNo) + 1;
      const updated = await client.query(
        `UPDATE medical_records
         SET chief_complaint = $2, diagnosis = $3, treatment = $4, version_no = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1
         RETURNING id, version_no AS "versionNo"`,
        [id, dto.chiefComplaint, dto.diagnosis, dto.treatment, nextVersion],
      );
      await client.query(
        `INSERT INTO record_versions (record_id, version_no, chief_complaint, diagnosis, treatment, change_source)
         VALUES ($1, $2, $3, $4, $5, '直接修改')`,
        [id, nextVersion, dto.chiefComplaint, dto.diagnosis, dto.treatment],
      );
      await this.audit.log(actor, '直接修改病历', `record:${id}`, client);
      return updated.rows[0];
    });
  }

  async listVersions(recordId: number) {
    const result = await this.database.query(
      `SELECT id, record_id AS "recordId", version_no AS "versionNo", chief_complaint AS "chiefComplaint",
              diagnosis, treatment, change_source AS "changeSource", created_at AS "createdAt"
       FROM record_versions WHERE record_id = $1 ORDER BY version_no DESC`,
      [recordId],
    );
    return result.rows;
  }
}
