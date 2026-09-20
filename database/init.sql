CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  actor VARCHAR(80) NOT NULL,
  action VARCHAR(120) NOT NULL,
  target VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS patients (
  id SERIAL PRIMARY KEY,
  record_no VARCHAR(32) UNIQUE NOT NULL,
  name VARCHAR(80) NOT NULL,
  gender VARCHAR(16) NOT NULL,
  age INT NOT NULL,
  id_card VARCHAR(32) UNIQUE NOT NULL,
  phone VARCHAR(32) NOT NULL,
  allergies TEXT,
  history TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS medical_records (
  id SERIAL PRIMARY KEY,
  patient_id INT REFERENCES patients(id),
  department VARCHAR(80) NOT NULL,
  doctor VARCHAR(80) NOT NULL,
  record_type VARCHAR(20) NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  version_no INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 兼容已有数据卷：为旧表补充版本字段
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS version_no INT NOT NULL DEFAULT 1;
ALTER TABLE medical_records ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- 病历版本留档：每次内容变更前后都会写入一条快照
CREATE TABLE IF NOT EXISTS record_versions (
  id SERIAL PRIMARY KEY,
  record_id INT NOT NULL REFERENCES medical_records(id),
  version_no INT NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  change_source VARCHAR(120) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (record_id, version_no)
);

-- 归档修订申请：同一医生对同一病历仅允许一条待处理申请
CREATE TABLE IF NOT EXISTS revision_requests (
  id SERIAL PRIMARY KEY,
  record_id INT NOT NULL REFERENCES medical_records(id),
  doctor VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待处理',
  review_comment TEXT,
  reviewer VARCHAR(80),
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_revision_per_record_doctor
  ON revision_requests (record_id, doctor) WHERE status = '待处理';

CREATE TABLE IF NOT EXISTS prescriptions (
  id SERIAL PRIMARY KEY,
  record_id INT REFERENCES medical_records(id),
  drug_name VARCHAR(120) NOT NULL,
  specification VARCHAR(80) NOT NULL,
  dosage VARCHAR(80) NOT NULL,
  frequency VARCHAR(80) NOT NULL,
  duration VARCHAR(80) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待审核'
);

INSERT INTO patients (record_no, name, gender, age, id_card, phone, allergies, history)
VALUES
  ('EMR202606001', '张若宁', '女', 34, '110101199201010028', '13800010001', '青霉素', '慢性鼻炎'),
  ('EMR202606002', '李明哲', '男', 48, '110101197801010019', '13800010002', '无', '高血压')
ON CONFLICT (record_no) DO NOTHING;

INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT id, '全科门诊', '王主任', '门诊', '发热伴咽痛 2 天', '急性上呼吸道感染', '对症治疗，复诊随访', '待审签'
FROM patients WHERE record_no = 'EMR202606001'
ON CONFLICT DO NOTHING;

-- 演示用已归档病历：用于走修订申请闭环
INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status, version_no)
SELECT id, '心内科', '王主任', '住院', '阵发性胸痛 3 天，活动后加重', '稳定型心绞痛', '阿司匹林联合他汀规范治疗', '已归档', 1
FROM patients WHERE record_no = 'EMR202606002'
ON CONFLICT DO NOTHING;

-- 为已有病历回填首版留档
INSERT INTO record_versions (record_id, version_no, chief_complaint, diagnosis, treatment, change_source)
SELECT id, version_no, chief_complaint, diagnosis, treatment, '建档留档'
FROM medical_records
ON CONFLICT (record_id, version_no) DO NOTHING;
