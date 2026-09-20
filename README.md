# 电子病历管理系统（GBEMR）

面向中小型医疗机构的电子病历管理系统，覆盖患者档案、结构化病历、医嘱处方、审签归档、统计检索和系统审计。

## 快速启动（Docker Compose）

```bash
cp .env.example .env
docker compose up -d
docker compose ps
```

访问地址：

- 前端：http://localhost:18930
- 后端健康检查：http://localhost:19930/health
- API 示例：http://localhost:18930/api/summary

停止服务：

```bash
docker compose down
```

## 项目主要功能

- 患者档案管理：录入姓名、性别、年龄、身份证号、手机号、过敏史、既往史，并支持姓名、身份证号、手机号检索。
- 病历书写与模板：门诊/住院病历结构化字段，集成富文本编辑器，按患者时间轴展示。
- 医嘱与处方管理：处方药品、规格、用法、频次、疗程和状态跟踪，支持打印预览入口。
- 病历权限与审签：内置医生、护士、管理员角色示例，演示 JWT 登录和审签归档状态。
- 归档病历修订闭环：已归档病历禁止直接改动，医生可发起修订申请，管理员批准生成新版本（旧版留档）或驳回（保留原文并填写意见），全程留痕并支持版本时间轴回读。
- 病历检索与统计：提供患者、病历、处方数量和科室工作量统计接口。
- 系统管理与基础数据：数据库初始化审计日志表，保留操作追踪能力。

## 归档病历修订闭环

针对“已归档病历不可随意修改，需申请修改并留痕”的要求，系统实现了完整的申请—审批—版本闭环：

1. **禁止直接改动**：`PATCH /api/records/:id/content` 只允许更新“当前且未归档”的病历；命中已归档版本直接返回 `409`，病历原文不受影响。
2. **医生发起申请**：`POST /api/records/:id/revisions` 提交修订原因以及新的主诉、诊断、治疗方案。数据库通过条件唯一索引
   `uq_pending_revision_per_doctor (record_id, doctor) WHERE status='待审批'` 保证同一份病历对同一医生**只保留一条待处理申请**，重复提交（含并发请求）只有一条成功，其余返回 `409`。
3. **管理员批准**：`POST /api/revisions/:id/approve` 在**同一事务**内锁定申请与当前版本，将旧版 `is_current` 置为 `false` 留档、原文不变，插入版本号 +1 的新版本并标记为当前版本，最后关闭申请、写入审批意见与审计日志。
4. **管理员驳回**：`POST /api/revisions/:id/reject` 必填审批意见，事务内仅把申请置为“已驳回”，病历原文保持不变。
5. **并发安全**：审批采用 `SELECT ... FOR UPDATE` 行锁，配合 `uq_current_version_per_root`（一条业务病历仅一个当前版本）兜底。两个管理员同时批准同一条申请时只有一人成功，另一人收到 `409`；任何失败都会整体回滚，不产生半更新。
6. **时间轴回读**：`GET /api/patients/:id/timeline` 同时返回该患者病历的全部历史版本与每条修订申请的审批状态、审批人和审批意见；前端“病历版本时间轴”按版本渲染，“管理员修订审批队列”支持批准与驳回。

审批相关接口：

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `PATCH` | `/api/records/:id/content` | 直接编辑（归档病历返回 409） |
| `POST` | `/api/records/:id/archive` | 审签归档 |
| `POST` | `/api/records/:id/revisions` | 医生提交修订申请 |
| `GET` | `/api/revisions?status=待审批` | 管理员审批队列 |
| `POST` | `/api/revisions/:id/approve` | 批准并在同一事务生成新版本 |
| `POST` | `/api/revisions/:id/reject` | 驳回（必填意见，保留原文） |
| `GET` | `/api/patients/:id/timeline` | 回读各版本与审批结果 |

## 本地开发方式

后端：

```bash
cd backend
npm install
npm run start:dev
```

前端：

```bash
cd frontend
npm install
npm run dev
```

本地开发时前端默认运行在 `18930`，Vite 会将 `/api` 代理到 `http://localhost:19930`。

## 技术栈

| 模块 | 技术 |
| --- | --- |
| 前端 | React 18、TypeScript、Vite、Ant Design、React Router、WangEditor |
| 后端 | NestJS、TypeScript、JWT、pg |
| 数据库 | PostgreSQL 15 |
| 部署 | Docker Compose、Nginx |

## 项目目录结构

```text
.
├── backend/              # NestJS 后端
│   ├── src/auth/         # 登录与 JWT
│   ├── src/common/       # 常量、数据库、审计日志
│   └── src/records/      # 患者档案与病历 API
├── database/
│   └── init.sql          # PostgreSQL 初始化脚本
├── frontend/             # React 前端
│   ├── src/api/          # API 请求
│   ├── src/components/   # 通用组件
│   ├── src/constants/    # 前端常量
│   ├── src/pages/        # 页面
│   └── src/types/        # 类型定义
├── docker-compose.yml
├── .env.example
└── README.md
```

## 环境变量说明

| 变量 | 说明 | 默认示例 |
| --- | --- | --- |
| `COMPOSE_PROJECT_NAME` | Compose 项目名，避免中文目录影响容器名 | `gbemr` |
| `DB_NAME` | PostgreSQL 数据库名 | `gbemr` |
| `DB_USER` | PostgreSQL 用户名 | `gbemr_user` |
| `DB_PASSWORD` | PostgreSQL 密码 | `change_me_strong_password` |
| `JWT_SECRET` | JWT 签名密钥 | `change_me_to_a_long_random_secret` |
| `FRONTEND_PORT` | 前端宿主机端口 | `18930` |
| `BACKEND_PORT` | 后端宿主机端口 | `19930` |

## Docker 部署说明

- `docker-compose.yml` 顶层声明 `name: gbemr`，并通过 `.env` 设置 `COMPOSE_PROJECT_NAME=gbemr`，可在中文目录名下直接启动。
- 前端端口映射为 `${FRONTEND_PORT:-18930}:80`，后端端口映射为 `${BACKEND_PORT:-19930}:3000`。
- 前端 Nginx 将 `/api/` 反向代理到 Docker 内部服务 `http://backend:3000/`。
- PostgreSQL 使用命名卷 `db_data` 持久化，不绑定到宿主机中文路径。
- 数据库和后端均配置 healthcheck，后端等待数据库 healthy 后启动，前端等待后端 healthy 后启动。

常见问题：

- 如果端口被占用，修改 `.env` 中的 `FRONTEND_PORT` 或 `BACKEND_PORT` 后重新执行 `docker compose up -d`。
- 首次启动前必须执行 `cp .env.example .env`。
- 修改数据库初始化脚本后如需重新初始化，可执行 `docker compose down -v` 清理数据卷。

## License

MIT
