export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordNotFound: '未找到病历',
  recordArchived: '已归档病历禁止直接改动，请提交修订申请并留痕',
  revisionFieldsRequired: '修订原因与新的主诉、诊断、治疗方案均不能为空',
  pendingRevisionExists: '该病历已存在一条待处理的修订申请，请等待管理员审批',
  revisionNotFound: '未找到待处理的修订申请',
  revisionNotPending: '该修订申请已处理，不能重复审批',
  revisionVersionMoved: '病历版本已变化，本次审批已被并发操作抢先处理',
  reviewCommentRequired: '驳回时必须填写审批意见',
  invalidRecordId: '病历编号无效',
};

export const ROLES = {
  doctor: 'doctor',
  nurse: 'nurse',
  admin: 'admin',
} as const;

export const RECORD_STATUS = {
  draft: '草稿',
  pendingReview: '待审签',
  archived: '已归档',
};

export const REVISION_STATUS = {
  pending: '待审批',
  approved: '已批准',
  rejected: '已驳回',
} as const;

// PostgreSQL 唯一约束 / 唯一索引冲突错误码。
export const PG_UNIQUE_VIOLATION = '23505';

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];
