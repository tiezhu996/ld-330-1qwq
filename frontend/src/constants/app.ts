export const APP_NAME = '电子病历管理系统';

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];

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

export const ROLE_OPTIONS = [
  { label: '医生', value: 'doctor' },
  { label: '护士', value: 'nurse' },
  { label: '管理员', value: 'admin' },
];

export const ROLE_CREDENTIALS: Record<string, { username: string; password: string }> = {
  doctor: { username: 'doctor', password: 'doctor123' },
  nurse: { username: 'nurse', password: 'nurse123' },
  admin: { username: 'admin', password: 'admin123' },
};
