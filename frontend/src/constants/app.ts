export const APP_NAME = '电子病历管理系统';

export const PRESCRIPTION_STATUS = ['待审核', '已审核', '已执行'];

export const ROLE_OPTIONS = [
  { label: '医生', value: 'doctor' },
  { label: '护士', value: 'nurse' },
  { label: '管理员', value: 'admin' },
];

export const REVISION_STATUS_LABEL: Record<string, { text: string; color: string }> = {
  待审批: { text: '待审批', color: 'gold' },
  已批准: { text: '已批准 · 已生成新版本', color: 'green' },
  已驳回: { text: '已驳回 · 保留原文', color: 'red' },
};
