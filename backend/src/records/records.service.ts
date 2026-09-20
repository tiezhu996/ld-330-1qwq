import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { QueryResultRow } from 'pg';
import { AuditService } from '../common/audit.service';
import {
  APP_MESSAGES,
  PG_UNIQUE_VIOLATION,
  RECORD_STATUS,
  REVISION_STATUS,
} from '../common/constants';
import { DatabaseService, QueryExecutor } from '../common/database.service';

export interface CreatePatientDto {
  name: string;
  gender: string;
  age: number;
  idCard: string;
  phone: string;
  allergies?: string;
  history?: string;
}

export interface RevisionContentDto {
  doctor?: string;
  reason: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
}

export interface ReviewRevisionDto {
  reviewer?: string;
  comment?: string;
}

interface RecordRow extends QueryResultRow {
  id: number;
  patient_id: number;
  root_record_id: number | null;
  version: number;
  department: string;
  doctor: string;
  record_type: string;
  chief_complaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  is_current: boolean;
  created_at: Date;
}

interface RevisionRow extends QueryResultRow {
  id: number;
  record_id: number;
  doctor: string;
  reason: string;
  chief_complaint: string;
  diagnosis: string;
  treatment: string;
  status: string;
  reviewer: string | null;
  review_comment: string | null;
  created_at: Date;
  reviewed_at: Date | null;
}

const RECORD_FIELDS = `id, patient_id AS "patientId", COALESCE(root_record_id, id) AS "rootId", version,
  department, doctor, record_type AS "recordType", chief_complaint AS "chiefComplaint",
  diagnosis, treatment, status, is_current AS "isCurrent", created_at AS "createdAt"`;

const REVISION_FIELDS = `id, record_id AS "recordId", doctor, reason, chief_complaint AS "chiefComplaint",
  diagnosis, treatment, status, reviewer, review_comment AS "reviewComment",
  created_at AS "createdAt", reviewed_at AS "reviewedAt"`;

// 与 medical_records 联表时必须限定 rr. 前缀，否则 status / created_at 等列名歧义。
const REVISION_FIELDS_JOINED = `rr.id, rr.record_id AS "recordId", rr.doctor, rr.reason,
  rr.chief_complaint AS "chiefComplaint", rr.diagnosis, rr.treatment, rr.status,
  rr.reviewer, rr.review_comment AS "reviewComment",
  rr.created_at AS "createdAt", rr.reviewed_at AS "reviewedAt"`;

function clean(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
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
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM medical_records WHERE is_current = TRUE'),
      this.database.query<{ count: string }>('SELECT COUNT(*) FROM prescriptions'),
      this.database.query<{ department: string; count: string }>(
        `SELECT department, COUNT(*) FROM medical_records
         WHERE is_current = TRUE GROUP BY department ORDER BY count DESC`,
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
      `SELECT id, record_no AS "recordNo", name, gender, age, id_card AS "idCard",
              phone, allergies, history, created_at AS "createdAt"
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

  // 时间轴回读：返回某患者的全部病历版本（含已留档旧版）与全部修订审批结果。
  async timeline(patientId: number) {
    const patient = await this.database.query('SELECT id, name FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const [versions, revisions] = await Promise.all([
      this.database.query(
        `SELECT ${RECORD_FIELDS} FROM medical_records
         WHERE patient_id = $1
         ORDER BY COALESCE(root_record_id, id), version ASC, created_at ASC`,
        [patientId],
      ),
      this.database.query(
        `SELECT ${REVISION_FIELDS_JOINED} FROM revision_requests rr
         JOIN medical_records mr ON mr.id = rr.record_id
         WHERE mr.patient_id = $1
         ORDER BY rr.created_at DESC`,
        [patientId],
      ),
    ]);
    return {
      patient: patient.rows[0],
      versions: versions.rows,
      revisions: revisions.rows,
    };
  }

  async createRecord(patientId: number) {
    const patient = await this.database.query('SELECT id FROM patients WHERE id = $1', [patientId]);
    if (!patient.rowCount) {
      throw new NotFoundException(APP_MESSAGES.patientNotFound);
    }
    const result = await this.database.query<{ id: number; status: string }>(
      `INSERT INTO medical_records
       (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
       VALUES ($1, '心内科', '赵医生', '门诊', '胸闷待查', '冠心病风险评估', '完善心电图与血脂检查', $2)
       RETURNING id, status`,
      [patientId, RECORD_STATUS.pendingReview],
    );
    await this.audit.log('doctor', '创建结构化病历', `record:${result.rows[0].id}`);
    return result.rows[0];
  }

  // 已归档病历禁止直接改动：只允许更新“当前 + 非已归档”的病历。
  async updateRecordContent(recordId: number, dto: RevisionContentDto) {
    const chiefComplaint = clean(dto.chiefComplaint);
    const diagnosis = clean(dto.diagnosis);
    const treatment = clean(dto.treatment);
    if (!chiefComplaint || !diagnosis || !treatment) {
      throw new BadRequestException(APP_MESSAGES.revisionFieldsRequired);
    }
    const result = await this.database.query(
      `UPDATE medical_records
       SET chief_complaint = $1, diagnosis = $2, treatment = $3
       WHERE id = $4 AND is_current = TRUE AND status <> $5
       RETURNING id, status`,
      [chiefComplaint, diagnosis, treatment, recordId, RECORD_STATUS.archived],
    );
    if (!result.rowCount) {
      await this.ensureRecordExists(recordId);
      throw new ConflictException(APP_MESSAGES.recordArchived);
    }
    await this.audit.log(dto.doctor || '医生', '直接编辑未归档病历', `record:${recordId}`);
    return result.rows[0];
  }

  async archiveRecord(recordId: number, reviewer = '系统管理员') {
    const result = await this.database.query(
      `UPDATE medical_records SET status = $1
       WHERE id = $2 AND is_current = TRUE AND status <> $1
       RETURNING id, status`,
      [RECORD_STATUS.archived, recordId],
    );
    if (!result.rowCount) {
      await this.ensureRecordExists(recordId);
      return { id: recordId, status: RECORD_STATUS.archived };
    }
    await this.audit.log(reviewer, '审签归档病历', `record:${recordId}`);
    return result.rows[0];
  }

  // 医生发起修订申请：一份病历只能保留一条待处理申请（DB 部分唯一索引兜底）。
  async createRevision(recordId: number, dto: RevisionContentDto) {
    const reason = clean(dto.reason);
    const chiefComplaint = clean(dto.chiefComplaint);
    const diagnosis = clean(dto.diagnosis);
    const treatment = clean(dto.treatment);
    if (!reason || !chiefComplaint || !diagnosis || !treatment) {
      throw new BadRequestException(APP_MESSAGES.revisionFieldsRequired);
    }
    const record = await this.database.query<RecordRow>(
      'SELECT * FROM medical_records WHERE id = $1',
      [recordId],
    );
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    if (record.rows[0].status !== RECORD_STATUS.archived || !record.rows[0].is_current) {
      throw new ConflictException(APP_MESSAGES.recordArchived);
    }
    try {
      const result = await this.database.query(
        `INSERT INTO revision_requests (record_id, doctor, reason, chief_complaint, diagnosis, treatment)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING ${REVISION_FIELDS}`,
        [recordId, dto.doctor || '王主任', reason, chiefComplaint, diagnosis, treatment],
      );
      await this.audit.log(dto.doctor || '王主任', '提交病历修订申请', `record:${recordId}`);
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === PG_UNIQUE_VIOLATION) {
        throw new ConflictException(APP_MESSAGES.pendingRevisionExists);
      }
      throw error;
    }
  }

  // 管理员批准：同一事务内锁定申请、校验版本、旧版留档、生成新版本、关闭申请。
  async approveRevision(revisionId: number, dto: ReviewRevisionDto) {
    const reviewer = dto.reviewer || '系统管理员';
    return this.database.withTransaction(async (executor) => {
      const locked = await executor.query<RevisionRow & { root_id: number | null }>(
        `SELECT rr.*, mr.root_record_id AS root_id
         FROM revision_requests rr
         JOIN medical_records mr ON mr.id = rr.record_id
         WHERE rr.id = $1
         FOR UPDATE OF rr`,
        [revisionId],
      );
      if (!locked.rowCount) {
        throw new NotFoundException(APP_MESSAGES.revisionNotFound);
      }
      const revision = locked.rows[0];
      if (revision.status !== REVISION_STATUS.pending) {
        throw new ConflictException(APP_MESSAGES.revisionNotPending);
      }

      // 锁定该业务病历的当前版本行；并发批准会在此排队，后到者读到最新版本号。
      const current = await executor.query<RecordRow>(
        `SELECT * FROM medical_records
         WHERE COALESCE(root_record_id, id) = $1 AND is_current = TRUE
         FOR UPDATE`,
        [revision.root_id ?? revision.record_id],
      );
      if (!current.rowCount || current.rows[0].id !== revision.record_id) {
        throw new ConflictException(APP_MESSAGES.revisionVersionMoved);
      }
      const oldVersion = current.rows[0];

      // 旧版留档：取消当前标记，原文保持不变。
      await executor.query(
        'UPDATE medical_records SET is_current = FALSE WHERE id = $1',
        [oldVersion.id],
      );
      // 生成新版本：沿用业务病历根 id，版本号 +1，批准后即为已归档当前版本。
      const inserted = await executor.query<RecordRow>(
        `INSERT INTO medical_records
         (patient_id, root_record_id, version, department, doctor, record_type,
          chief_complaint, diagnosis, treatment, status, is_current)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, TRUE)
         RETURNING ${RECORD_FIELDS}`,
        [
          oldVersion.patient_id,
          oldVersion.root_record_id ?? oldVersion.id,
          oldVersion.version + 1,
          oldVersion.department,
          revision.doctor,
          oldVersion.record_type,
          revision.chief_complaint,
          revision.diagnosis,
          revision.treatment,
          RECORD_STATUS.archived,
        ],
      );

      await executor.query(
        `UPDATE revision_requests
         SET status = $1, reviewer = $2, review_comment = $3, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $4`,
        [REVISION_STATUS.approved, reviewer, clean(dto.comment) || '同意修订，已生成新版本', revisionId],
      );
      await this.audit.log(reviewer, '批准病历修订并生成新版本', `record:${oldVersion.id} -> v${oldVersion.version + 1}`, executor);
      return { request: revisionId, newVersion: inserted.rows[0] };
    });
  }

  // 管理员驳回：保留病历原文不变，仅在申请上填写意见并关闭，事务保证不产生半更新。
  async rejectRevision(revisionId: number, dto: ReviewRevisionDto) {
    const comment = clean(dto.comment);
    if (!comment) {
      throw new BadRequestException(APP_MESSAGES.reviewCommentRequired);
    }
    const reviewer = dto.reviewer || '系统管理员';
    return this.database.withTransaction(async (executor) => {
      const locked = await executor.query<RevisionRow>(
        'SELECT * FROM revision_requests WHERE id = $1 FOR UPDATE',
        [revisionId],
      );
      if (!locked.rowCount) {
        throw new NotFoundException(APP_MESSAGES.revisionNotFound);
      }
      if (locked.rows[0].status !== REVISION_STATUS.pending) {
        throw new ConflictException(APP_MESSAGES.revisionNotPending);
      }
      const result = await executor.query(
        `UPDATE revision_requests
         SET status = $1, reviewer = $2, review_comment = $3, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $4 AND status = $5
         RETURNING ${REVISION_FIELDS}`,
        [REVISION_STATUS.rejected, reviewer, comment, revisionId, REVISION_STATUS.pending],
      );
      if (!result.rowCount) {
        throw new ConflictException(APP_MESSAGES.revisionNotPending);
      }
      await this.audit.log(reviewer, '驳回病历修订申请', `revision:${revisionId}`, executor);
      return result.rows[0];
    });
  }

  async listRevisions(status?: string) {
    const params: unknown[] = [];
    let where = '';
    const wanted = clean(status);
    if (wanted) {
      where = 'WHERE rr.status = $1';
      params.push(wanted);
    }
    const result = await this.database.query(
      `SELECT ${REVISION_FIELDS_JOINED}, mr.patient_id AS "patientId", mr.version
       FROM revision_requests rr
       JOIN medical_records mr ON mr.id = rr.record_id
       ${where}
       ORDER BY rr.created_at DESC`,
      params,
    );
    return result.rows;
  }

  private async ensureRecordExists(recordId: number): Promise<void> {
    const record = await this.database.query('SELECT id FROM medical_records WHERE id = $1', [recordId]);
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
  }
}
