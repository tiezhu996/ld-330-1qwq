import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { AuditService } from '../common/audit.service';
import { APP_MESSAGES, RECORD_STATUS, REVISION_STATUS } from '../common/constants';
import { DatabaseService } from '../common/database.service';

export interface CreateRevisionDto {
  doctor: string;
  reason: string;
  chiefComplaint: string;
  diagnosis: string;
  treatment: string;
}

export interface ReviewRevisionDto {
  reviewer: string;
  comment?: string;
}

const REVISION_SELECT = `
  id, record_id AS "recordId", doctor, reason,
  chief_complaint AS "chiefComplaint", diagnosis, treatment,
  status, review_comment AS "reviewComment", reviewer,
  created_at AS "createdAt", reviewed_at AS "reviewedAt"`;

@Injectable()
export class RevisionsService {
  constructor(
    private readonly database: DatabaseService,
    private readonly audit: AuditService,
  ) {}

  async submit(recordId: number, dto: CreateRevisionDto) {
    const record = await this.database.query<{ id: number; status: string }>(
      'SELECT id, status FROM medical_records WHERE id = $1',
      [recordId],
    );
    if (!record.rowCount) {
      throw new NotFoundException(APP_MESSAGES.recordNotFound);
    }
    if (record.rows[0].status !== RECORD_STATUS.archived) {
      throw new BadRequestException(APP_MESSAGES.revisionOnlyForArchived);
    }
    try {
      const result = await this.database.query(
        `INSERT INTO revision_requests (record_id, doctor, reason, chief_complaint, diagnosis, treatment, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING id, record_id AS "recordId", doctor, reason, status, created_at AS "createdAt"`,
        [recordId, dto.doctor, dto.reason, dto.chiefComplaint, dto.diagnosis, dto.treatment, REVISION_STATUS.pending],
      );
      await this.audit.log(dto.doctor, '提交归档修订申请', `record:${recordId}`);
      return result.rows[0];
    } catch (error) {
      if ((error as { code?: string }).code === '23505') {
        throw new ConflictException(APP_MESSAGES.duplicatePendingRevision);
      }
      throw error;
    }
  }

  async listForRecord(recordId: number) {
    const result = await this.database.query(
      `SELECT ${REVISION_SELECT} FROM revision_requests WHERE record_id = $1 ORDER BY created_at DESC`,
      [recordId],
    );
    return result.rows;
  }

  async listPending() {
    const result = await this.database.query(
      `SELECT ${REVISION_SELECT} FROM revision_requests WHERE status = $1 ORDER BY created_at ASC`,
      [REVISION_STATUS.pending],
    );
    return result.rows;
  }

  async approve(id: number, dto: ReviewRevisionDto) {
    return this.database.withTransaction(async (client) => {
      const claimed = await client.query(
        `UPDATE revision_requests
         SET status = $2, reviewer = $3, review_comment = $4, reviewed_at = CURRENT_TIMESTAMP
         WHERE id = $1 AND status = $5
         RETURNING record_id AS "recordId", doctor,
                   chief_complaint AS "chiefComplaint", diagnosis, treatment`,
        [id, REVISION_STATUS.approved, dto.reviewer, dto.comment ?? '', REVISION_STATUS.pending],
      );
      if (!claimed.rowCount) {
        throw new ConflictException(APP_MESSAGES.revisionNotPending);
      }
      const request = claimed.rows[0];
      const current = await client.query(
        `SELECT version_no AS "versionNo", chief_complaint AS "chiefComplaint", diagnosis, treatment
         FROM medical_records WHERE id = $1 FOR UPDATE`,
        [request.recordId],
      );
      if (!current.rowCount) {
        throw new NotFoundException(APP_MESSAGES.recordNotFound);
      }
      const oldVersion = current.rows[0];
      await client.query(
        `INSERT INTO record_versions (record_id, version_no, chief_complaint, diagnosis, treatment, change_source)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (record_id, version_no) DO NOTHING`,
        [
          request.recordId,
          oldVersion.versionNo,
          oldVersion.chiefComplaint,
          oldVersion.diagnosis,
          oldVersion.treatment,
          `批准前留档(申请#${id})`,
        ],
      );
      const nextVersion = Number(oldVersion.versionNo) + 1;
      await client.query(
        `UPDATE medical_records
         SET chief_complaint = $2, diagnosis = $3, treatment = $4, version_no = $5, updated_at = CURRENT_TIMESTAMP
         WHERE id = $1`,
        [request.recordId, request.chiefComplaint, request.diagnosis, request.treatment, nextVersion],
      );
      await client.query(
        `INSERT INTO record_versions (record_id, version_no, chief_complaint, diagnosis, treatment, change_source)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [request.recordId, nextVersion, request.chiefComplaint, request.diagnosis, request.treatment, `修订申请#${id} 批准生效`],
      );
      await this.audit.log(dto.reviewer, '批准归档修订申请', `revision:${id}`, client);
      return { id, status: REVISION_STATUS.approved, recordId: request.recordId, versionNo: nextVersion };
    });
  }

  async reject(id: number, dto: ReviewRevisionDto) {
    if (!dto.comment || !dto.comment.trim()) {
      throw new BadRequestException(APP_MESSAGES.reviewCommentRequired);
    }
    const result = await this.database.query(
      `UPDATE revision_requests
       SET status = $2, reviewer = $3, review_comment = $4, reviewed_at = CURRENT_TIMESTAMP
       WHERE id = $1 AND status = $5
       RETURNING id, record_id AS "recordId"`,
      [id, REVISION_STATUS.rejected, dto.reviewer, dto.comment, REVISION_STATUS.pending],
    );
    if (!result.rowCount) {
      throw new ConflictException(APP_MESSAGES.revisionNotPending);
    }
    await this.audit.log(dto.reviewer, '驳回归档修订申请', `revision:${id}`);
    return { id, status: REVISION_STATUS.rejected, recordId: result.rows[0].recordId };
  }
}
