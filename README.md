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
- 归档修订闭环：已归档病历禁止直接改动；医生提交修订申请（原因 + 新主诉/诊断/治疗方案），同一病历同一医生仅允许一条待处理申请；管理员批准时在同一事务内生成新版本并留档旧版，驳回则保留原文并记录审批意见；重复申请与并发审批只会成功一次，失败不产生半更新；时间轴可回读全部版本与审批结果。
- 病历检索与统计：提供患者、病历、处方数量和科室工作量统计接口。
- 系统管理与基础数据：数据库初始化审计日志表，保留操作追踪能力。

## 归档修订闭环说明

| 步骤 | 接口 | 说明 |
| --- | --- | --- |
| 直接修改 | `PUT /api/records/:id` | 仅医生/管理员；已归档病历返回 403，未归档病历修改即留档 |
| 提交申请 | `POST /api/records/:id/revision-requests` | 仅医生/管理员；部分唯一索引保证一病历一医生一条待处理 |
| 待审批列表 | `GET /api/revision-requests/pending` | 仅管理员 |
| 批准 | `POST /api/revision-requests/:id/approve` | 仅管理员；条件更新抢占 + 事务内旧版留档、新版本生效 |
| 驳回 | `POST /api/revision-requests/:id/reject` | 仅管理员；必须填写审批意见，原病历不变 |
| 版本回读 | `GET /api/patients/:id/timeline`、`GET /api/records/:id/versions` | 时间轴返回每份病历的版本留档与审批记录 |

演示账号：`doctor/doctor123`（医生）、`nurse/nurse123`（护士）、`admin/admin123`（管理员）。前端右上角切换角色即自动登录对应账号。

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
│   ├── src/common/       # 常量、数据库（含事务助手）、审计日志、角色守卫
│   ├── src/records/      # 患者档案、病历直改拦截与版本时间轴 API
│   └── src/revisions/    # 归档修订申请、事务化审批闭环
├── database/
│   └── init.sql          # PostgreSQL 初始化脚本（含版本留档与修订申请表）
├── frontend/             # React 前端
│   ├── src/api/          # API 请求（含 JWT 拦截器）
│   ├── src/components/   # 通用组件、修订申请弹窗、审批面板
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
