export const APP_MESSAGES = {
  unauthorized: '当前用户未登录或令牌无效',
  forbidden: '当前角色无权执行该操作',
  patientNotFound: '未找到患者档案',
  recordNotFound: '未找到病历',
  recordArchived: '已归档病历禁止直接改动，请提交修订申请',
  revisionOnlyForArchived: '仅已归档病历需要提交修订申请',
  duplicatePendingRevision: '该病历已存在您的待处理修订申请',
  revisionNotPending: '修订申请不存在或已被处理',
  reviewCommentRequired: '驳回时必须填写审核意见',
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
  pending: '待处理',
  approved: '已批准',
  rejected: '已驳回',
};

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];
