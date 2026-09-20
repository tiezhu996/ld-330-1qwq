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

-- 病历版本表：一条业务病历（root_record_id 相同）可包含多个版本，
-- is_current 标记当前生效版本，已归档的旧版本只能留档，不允许直接改动。
CREATE TABLE IF NOT EXISTS medical_records (
  id SERIAL PRIMARY KEY,
  patient_id INT REFERENCES patients(id),
  root_record_id INT REFERENCES medical_records(id),
  version INT NOT NULL DEFAULT 1,
  department VARCHAR(80) NOT NULL,
  doctor VARCHAR(80) NOT NULL,
  record_type VARCHAR(20) NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  status VARCHAR(20) NOT NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- 修订申请：医生对一份病历只能保留一条“待处理”申请。
CREATE TABLE IF NOT EXISTS revision_requests (
  id SERIAL PRIMARY KEY,
  record_id INT NOT NULL REFERENCES medical_records(id),
  doctor VARCHAR(80) NOT NULL,
  reason TEXT NOT NULL,
  chief_complaint TEXT NOT NULL,
  diagnosis TEXT NOT NULL,
  treatment TEXT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT '待审批',
  reviewer VARCHAR(80),
  review_comment TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at TIMESTAMP
);

-- 关键约束：同一份病历 + 同一医生只允许存在一条待处理申请，
-- 依靠数据库唯一索引兜底重复申请与并发写入。
CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_revision_per_doctor
  ON revision_requests (record_id, doctor)
  WHERE status = '待审批';

-- 一条业务病历最多只有一个当前版本，防止并发批准产生两个新版本。
CREATE UNIQUE INDEX IF NOT EXISTS uq_current_version_per_root
  ON medical_records (COALESCE(root_record_id, id))
  WHERE is_current = TRUE;

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
SELECT p.id, '全科门诊', '王主任', '门诊', '发热伴咽痛 2 天', '急性上呼吸道感染', '对症治疗，复诊随访', '待审签'
FROM patients p
WHERE p.record_no = 'EMR202606001'
  AND NOT EXISTS (
    SELECT 1 FROM medical_records mr WHERE mr.patient_id = p.id AND mr.doctor = '王主任'
  );

-- 一条已归档病历，用于演示“禁止直接改动 → 申请修订 → 批准生成新版本/驳回留痕”闭环。
INSERT INTO medical_records (patient_id, department, doctor, record_type, chief_complaint, diagnosis, treatment, status)
SELECT p.id, '心内科', '赵医生', '门诊', '间断胸闷 1 周', '冠心病待排', '完善心电图与血脂检查，门诊随访', '已归档'
FROM patients p
WHERE p.record_no = 'EMR202606002'
  AND NOT EXISTS (
    SELECT 1 FROM medical_records mr WHERE mr.patient_id = p.id AND mr.doctor = '赵医生'
  );

-- 根版本回填：历史数据无 root_record_id，统一指向自身。
UPDATE medical_records SET root_record_id = id WHERE root_record_id IS NULL;

INSERT INTO revision_requests (record_id, doctor, reason, chief_complaint, diagnosis, treatment)
SELECT mr.id, '赵医生', '外院冠脉 CT 回报提示前降支轻度狭窄，需补充诊断与随访方案',
       '间断胸闷 1 周，活动后加重', '冠状动脉粥样硬化性心脏病（前降支轻度狭窄）',
       '他汀调脂、阿司匹林抗血小板，4 周后复查血脂与肝肾功能'
FROM medical_records mr
WHERE mr.doctor = '赵医生'
  AND mr.is_current = TRUE
  AND NOT EXISTS (
    -- 同一医生对该患者的任意版本只要有过申请（含已批准/驳回），就不再补演示数据，
    -- 保证 init.sql 可重复执行而不重复造数。
    SELECT 1
    FROM revision_requests rr
    JOIN medical_records other ON other.id = rr.record_id
    WHERE other.patient_id = mr.patient_id AND rr.doctor = mr.doctor
  );
